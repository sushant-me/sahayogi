import { useState } from "react";

import { Layout, type PageId } from "./components/Layout";
import { ToastStack } from "./components/ToastStack";
import { UpdateBanner } from "./components/UpdateBanner";
import { AskPage } from "./pages/AskPage";
import { HistoryPage } from "./pages/HistoryPage";
import { QuizPage } from "./pages/QuizPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { AppProvider } from "./state/AppContext";
import { useApp } from "./state/appContext";

function Screens() {
  const { configured } = useApp();
  const [page, setPage] = useState<PageId>("ask");

  if (!configured) {
    return <SetupPage />;
  }

  return (
    <Layout page={page} onNavigate={setPage}>
      {page === "ask" ? <AskPage /> : null}
      {page === "quiz" ? <QuizPage /> : null}
      {page === "history" ? <HistoryPage /> : null}
      {page === "settings" ? <SettingsPage /> : null}
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Screens />
      <ToastStack />
      <UpdateBanner />
    </AppProvider>
  );
}
