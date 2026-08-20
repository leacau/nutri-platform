import PatientsClientPage from "./patients-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PatientsPage() {
  return <PatientsClientPage />;
}
