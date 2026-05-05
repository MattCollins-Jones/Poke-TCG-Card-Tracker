import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import SetsPage from './pages/SetsPage.jsx';
import CardsPage from './pages/CardsPage.jsx';
import CollectionPage from './pages/CollectionPage.jsx';
import WishlistPage from './pages/WishlistPage.jsx';
import SyncPage from './pages/SyncPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<SetsPage />} />
          <Route path="/sets/:setId" element={<CardsPage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/sync" element={<SyncPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
