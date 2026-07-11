import PolicyReportPage from '@/components/PolicyReportPage';

export default function UpcomingRenewalsPage() {
  return (
    <PolicyReportPage
      title="Upcoming Renewals"
      description="Health policies due soon, separated from the dashboard for focused renewal follow-up."
      mode="upcomingExpiry"
      status="Pending"
      daysAhead={30}
    />
  );
}
