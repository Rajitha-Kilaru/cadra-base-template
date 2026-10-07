import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

function OrdersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="12" rx="1.5" />
      <line x1="5" y1="7" x2="13" y2="7" />
      <line x1="5" y1="10" x2="11" y2="10" />
    </svg>
  );
}

function NewOrderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="3" x2="9" y2="15" />
      <line x1="3" y1="9" x2="15" y2="9" />
    </svg>
  );
}

function FarmIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 15V7l7-4 7 4v8" />
      <rect x="4" y="9" width="10" height="6" rx="1" />
      <line x1="7" y1="11" x2="7" y2="15" />
      <line x1="11" y1="11" x2="11" y2="15" />
    </svg>
  );
}

function ProductIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2L2 6v6l7 4 7-4V6L9 2z" />
      <line x1="2" y1="6" x2="9" y2="10" />
      <line x1="9" y1="10" x2="16" y2="6" />
      <line x1="9" y1="10" x2="9" y2="17" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="5" x2="17" y2="5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15" x2="17" y2="15" />
    </svg>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isOrdersActive = location.pathname === '/' || location.pathname.startsWith('/orders/');
  const isNewOrderActive = location.pathname === '/orders/new';
  const isFarmsActive = location.pathname.startsWith('/farms');
  const isProductsActive = location.pathname.startsWith('/products');

  return (
    <div className="app-layout">
      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">PR</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">Prairie Ridge</span>
            <span className="sidebar-brand-sub">Ag Supply</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            className={`sidebar-link${isOrdersActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-link-icon"><OrdersIcon /></span>
            Orders
          </NavLink>
          <NavLink
            to="/orders/new"
            className={`sidebar-link${isNewOrderActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-link-icon"><NewOrderIcon /></span>
            New Order
          </NavLink>
          <NavLink
            to="/farms"
            className={`sidebar-link${isFarmsActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-link-icon"><FarmIcon /></span>
            Farms
          </NavLink>
          <NavLink
            to="/products"
            className={`sidebar-link${isProductsActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-link-icon"><ProductIcon /></span>
            Products
          </NavLink>
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-avatar">JD</div>
          <div>
            <div className="sidebar-user-name">Jack Davis</div>
            <div className="sidebar-user-role">Farm Operator</div>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-menu-btn"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle sidebar"
            >
              <MenuIcon />
            </button>
            <span className="topbar-title">Ordering Portal</span>
          </div>
          <div className="topbar-right">
            <div className="topbar-user">
              <div className="topbar-avatar">JD</div>
              <span className="topbar-user-label">Jack Davis</span>
            </div>
          </div>
        </header>

        <main className="main-area">
          {children}
        </main>
      </div>
    </div>
  );
}