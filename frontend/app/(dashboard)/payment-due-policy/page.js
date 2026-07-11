import PolicyReportPage from '@/components/PolicyReportPage';

export default function PaymentDuePolicyPage() {
  return (
    <PolicyReportPage
      title="Payment Due Policy"
      description="Pending policies whose premium due dates have passed and need immediate collection action."
      mode="paymentDue"
      status="Pending"
    />
  );
}
