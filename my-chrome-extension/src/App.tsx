import { useState } from "react";
import Auth from "./authMain";
import TalkyWindow from "./talkywindow";

const App: React.FC = () => {
  const [isAccountVerified, setIsAccountVerified] = useState(false);

  return (
    <div>
      <Auth onAuthChange={setIsAccountVerified} />
      {isAccountVerified && <TalkyWindow />}
    </div>
  );
};

export default App;