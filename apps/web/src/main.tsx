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
import '../../../dist/legacy-workspace-toolbar.css';

createRoot(document.getElementById('root')!).render(<MarketLabApp embedded={new URLSearchParams(location.search).get('embedded')==='1'} />);
