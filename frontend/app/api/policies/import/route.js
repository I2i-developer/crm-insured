import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/server-auth';
import { validatePolicyInput } from '@/lib/validation';
import ExcelJS from 'exceljs';

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function normalizeCellValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('result' in value) return value.result;
    if ('text' in value) return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map(part => part.text || '').join('');
    }
  }

  return value;
}

async function parseImportFile(file, buffer) {
  const fileName = (file.name || '').toLowerCase();

  if (fileName.endsWith('.csv') || file.type === 'text/csv') {
    const text = Buffer.from(buffer).toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      return headers.reduce((row, header, index) => {
        row[header] = values[index] ?? '';
        return row;
      }, {});
    });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer));
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value || '').trim();
  });

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      record[header] = normalizeCellValue(row.getCell(colNumber).value);
    });
    if (Object.values(record).some(value => value !== null && value !== undefined && value !== '')) {
      rows.push(record);
    }
  });

  return rows;
}

export async function POST(request) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const fileName = (file.name || '').toLowerCase();
    const supportedFile = fileName.endsWith('.csv') || fileName.endsWith('.xlsx');
    if (!supportedFile) {
      return NextResponse.json({ error: 'Only CSV or Excel files are supported' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be 2MB or smaller' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const data = await parseImportFile(file, buffer);

    if (data.length === 0) {
      return NextResponse.json({ error: 'No data found in file' }, { status: 400 });
    }

    if (data.length > 1000) {
      return NextResponse.json({ error: 'Import is limited to 1000 rows per file' }, { status: 400 });
    }

    const requiredFields = ['client_name', 'insurance_company', 'policy_number', 'premium_amount', 'due_date', 'issuance_date'];
    const firstRow = data[0];
    const missingFields = requiredFields.filter(field => !(field in firstRow));

    if (missingFields.length > 0) {
      return NextResponse.json({
        error: 'Missing required columns',
        missing: missingFields
      }, { status: 400 });
    }

    const rows = data.map((row, index) => {
      const { policy, errors } = validatePolicyInput(row);
      return { policy: { ...policy, user_id: auth.userId }, errors, rowNumber: index + 2 };
    });

    const invalidRows = rows.filter(row => row.errors.length);
    if (invalidRows.length) {
      return NextResponse.json({
        error: 'Import contains invalid rows',
        rows: invalidRows.slice(0, 10).map(row => ({
          row: row.rowNumber,
          errors: row.errors
        }))
      }, { status: 400 });
    }

    const policiesToInsert = rows.map(row => row.policy);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from('policies')
      .insert(policiesToInsert)
      .select();

    if (insertError) {
      console.error('Bulk insert error:', insertError);
      return NextResponse.json({
        error: 'Failed to import policies',
        details: insertError.message
      }, { status: 400 });
    }

    return NextResponse.json({
      message: `Successfully imported ${insertedData.length} policies`,
      imported: insertedData.length,
      failed: data.length - insertedData.length
    }, { status: 201 });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Failed to import file' }, { status: 500 });
  }
}
