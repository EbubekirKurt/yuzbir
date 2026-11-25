import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initialTheme } from './theme';

// İlk çizimden önce temayı uygula (yanıp sönme olmasın).
document.documentElement.dataset.theme = initialTheme();

createRoot(document.getElementById('root')!).render(<App />);
