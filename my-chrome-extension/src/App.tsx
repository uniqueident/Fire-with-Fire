import { useState } from "react";
import Auth from "./authMain";
import TalkyWindow from "./talkywindow";
import menteLogo from "./assets/Mente Logo.png";
import "./App.css";

const App: React.FC = () => {
  const [isAccountVerified, setIsAccountVerified] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <img className="app-logo" src={menteLogo} alt="Mente flower logo" />
        <span className="app-title">Mente</span>
      </header>
      <main className="app-content">
        <Auth onAuthChange={setIsAccountVerified} />
        {isAccountVerified && <TalkyWindow />}
      </main>
    </div>
  );
};

export default App;