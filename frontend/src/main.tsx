import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { OrderListPage } from './pages/OrderListPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { FarmListPage } from './pages/FarmListPage';
import { FarmDetailPage } from './pages/FarmDetailPage';
import { FarmFormPage } from './pages/FarmFormPage';
import { ProductListPage } from './pages/ProductListPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { AppLayout } from './components/AppLayout';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="not-found-code">404</div>
      <div className="not-found-message">Page not found</div>
      <p className="not-found-detail">The page you requested does not exist.</p>
      <div className="not-found-actions">
        <Link to="/" className="btn btn-primary">Back to Orders</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<OrderListPage />} />
            <Route path="/orders/new" element={<NewOrderPage />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/farms" element={<FarmListPage />} />
            <Route path="/farms/new" element={<FarmFormPage />} />
            <Route path="/farms/:farmId" element={<FarmDetailPage />} />
            <Route path="/farms/:farmId/edit" element={<FarmFormPage />} />
            <Route path="/products" element={<ProductListPage />} />
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/:productCode" element={<ProductDetailPage />} />
            <Route path="/products/:productCode/edit" element={<ProductFormPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);