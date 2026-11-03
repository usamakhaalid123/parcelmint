import { signOut } from "@/modules/auth/server/sign-out";

export default function AdminDashboardPage() {
  return (
    <main className="status-page" id="main-content">
      <p className="eyebrow">Administration</p>
      <h1>Operations dashboard foundation</h1>
      <p>
        This protected route is ready for catalog, inventory, order, and reconciliation modules.
      </p>
      <form action={signOut}>
        <button className="primary-action" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
