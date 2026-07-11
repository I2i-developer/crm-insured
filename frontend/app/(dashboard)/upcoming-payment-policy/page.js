import PolicyReportPage from '@/components/PolicyReportPage';

export default function UpcomingPaymentPolicyPage() {
  return (
    <PolicyReportPage
      title="Upcoming Payment Policy"
      description="Pending premium payments due soon, grouped into practical collection windows."
      mode="upcomingPayment"
      status="Pending"
      daysAhead={30}
    />
  );
}
