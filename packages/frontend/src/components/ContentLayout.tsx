import { Outlet } from 'react-router-dom';

export function ContentLayout() {
  return (
    <main className="flex-1 overflow-y-auto p-6">
      <Outlet />
    </main>
  );
}
