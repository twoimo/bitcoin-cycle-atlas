import { initTheme } from '../../../dist/ui/theme.js';
import '../../../dist/fonts/pretendard/pretendard-variable.css';
import { createRoot } from 'react-dom/client';
import { MarketLabApp } from './app.js';
import '../../../dist/styles.css';
import '../../../dist/market-lab.css';
import './web.css';
import '../../../dist/vendor/skullet/styles.css';
import '../../../dist/loading-surfaces.css';
import '../../../dist/atlas-shell.css';
import '../../../dist/symbol-selector.css';
import './rsi-workbench.css';
import './housing.css';
import './themes.css';
import './us-direction.css';
import './workspace.css';
import '../../../dist/compact-toolbar.css';
import '../../../dist/ui/rsi-simulation.css';
import '../../../dist/legacy-workspace-toolbar.css';
import '../../../dist/editorial-system.css';
import '../../../dist/editorial-panels.css';
import './instrument-workbench.css';
import '../../../dist/ui/chart-legend.css';
import '../../../dist/ui/quote-hud.css';

initTheme();

createRoot(document.getElementById('root')!).render(<MarketLabApp embedded={new URLSearchParams(location.search).get('embedded')==='1'} />);
