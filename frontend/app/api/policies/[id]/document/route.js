import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POLICY_DOCUMENT_BUCKET = 'policy-documents';
const MAX_POLICY_DOCUMENT_SIZE = 8 * 1024 * 1024;

async function getPolicyId(params) {
  const resolvedParams = await params;
  return resolvedParams?.id;
}

async function ensurePolicyDocumentBucket(supabaseAdmin) {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if ((buckets || []).some(bucket => bucket.name === POLICY_DOCUMENT_BUCKET)) return;

  const { error } = await supabaseAdmin.storage.createBucket(POLICY_DOCUMENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_POLICY_DOCUMENT_SIZE,
    allowedMimeTypes: ['application/pdf']
  });

  if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
    throw error;
  }
}

function getSafeFileName(file) {
  const baseName = String(file.name || 'epolicy.pdf')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'epolicy';

  return `${baseName}.pdf`;
}

export async function POST(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = await getPolicyId(params);
    if (!UUID_PATTERN.test(String(id || ''))) {
      return NextResponse.json({ error: 'Invalid policy id' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('document');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'E-policy PDF is required' }, { status: 400 });
    }

    if (file.type !== 'application/pdf' && !String(file.name || '').toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Upload a PDF e-policy document' }, { status: 400 });
    }

    if (file.size > MAX_POLICY_DOCUMENT_SIZE) {
      return NextResponse.json({ error: 'E-policy PDF must be 8MB or smaller' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let policyQuery = supabaseAdmin
      .from('policies')
      .select('id, user_id, policy_number, client_name')
      .eq('id', id);

    if (!isPrivilegedRole(auth.role)) {
      policyQuery = policyQuery.eq('user_id', auth.userId);
    }

    const { data: policy, error: policyError } = await policyQuery.single();
    if (policyError || !policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    await ensurePolicyDocumentBucket(supabaseAdmin);

    const fileName = getSafeFileName(file);
    const path = `${policy.user_id}/${policy.id}/epolicy-${Date.now()}-${fileName}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(POLICY_DOCUMENT_BUCKET)
      .upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: updatedPolicy, error: updateError } = await supabaseAdmin
      .from('policies')
      .update({
        epolicy_pdf_path: path,
        epolicy_pdf_name: fileName,
        epolicy_pdf_uploaded_at: new Date().toISOString()
      })
      .eq('id', policy.id)
      .select()
      .single();

    if (updateError || !updatedPolicy) {
      return NextResponse.json({ error: updateError?.message || 'Failed to save e-policy document' }, { status: 400 });
    }

    const { data: signedUrlData } = await supabaseAdmin.storage
      .from(POLICY_DOCUMENT_BUCKET)
      .createSignedUrl(path, 60 * 10);

    await writeAuditLog(request, auth, {
      action: 'policy.document_upload',
      entityType: 'policy',
      entityId: policy.id,
      summary: `Uploaded e-policy PDF for ${policy.policy_number}`,
      metadata: { policy_number: policy.policy_number, file_name: fileName }
    });

    return NextResponse.json({
      message: 'E-policy PDF uploaded successfully',
      policy: {
        ...updatedPolicy,
        epolicy_pdf_signed_url: signedUrlData?.signedUrl || ''
      }
    });
  } catch (error) {
    console.error('Policy document upload error:', error);
    return NextResponse.json({ error: 'Failed to upload e-policy PDF' }, { status: 500 });
  }
}
