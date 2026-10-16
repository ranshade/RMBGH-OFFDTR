import { Toaster } from "sonner";
import Header from "./components/Header";
import AdminGate from "./components/AdminGate";
import AttendanceKiosk from "./components/AttendanceKiosk";
import EmployeeManagement from "./components/EmployeeManagement";
import LogsPage from "./components/LogsPage";
import DtrPrint from "./components/DtrPrint";
import MyLogs from "./components/MyLogs";
import KpiPage from "./components/KpiPage";
import SystemLogsPage from "./components/SystemLogsPage";

export default function App() {
  const view = new URLSearchParams(window.location.search).get("view");
  const current =
    view === "manage"
      ? "manage"
      : view === "logs"
        ? "logs"
        : view === "dtr"
          ? "dtr"
          : view === "mylogs"
            ? "mylogs"
            : view === "kpi"
              ? "kpi"
              : view === "syslogs"
                ? "syslogs"
                : "kiosk";

  return (
    <div className={`app-shell app-view-${current} flex min-h-screen flex-col`}>
      <Toaster
        position="top-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: "!rounded-lg !border !shadow-sm",
            success: "!border-sky-200 !bg-sky-50 !text-sky-900",
            error: "!border-red-200 !bg-red-50 !text-red-800",
          },
        }}
      />
      <Header view={current} />
      <div className="flex flex-1 flex-col">
        {current === "kiosk" && <AttendanceKiosk />}
        {current === "manage" && (
          <AdminGate>{(auth) => <EmployeeManagement {...auth} />}</AdminGate>
        )}
        {current === "logs" && (
          <AdminGate>{(auth) => <LogsPage {...auth} />}</AdminGate>
        )}
        {current === "mylogs" && <MyLogs />}
        {current === "dtr" && (
          <AdminGate>{(auth) => <DtrPrint {...auth} />}</AdminGate>
        )}
        {current === "kpi" && (
          <AdminGate>{(auth) => <KpiPage {...auth} />}</AdminGate>
        )}
        {current === "syslogs" && (
          <AdminGate>{(auth) => <SystemLogsPage {...auth} />}</AdminGate>
        )}
      </div>
    </div>
  );
}
