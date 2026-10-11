import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar onToggleNav={() => setNavOpen((value) => !value)} />
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}