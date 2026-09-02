// The single-user (solo) app is still JSX and is not type-checked; Task 15
// converts it. AppShell renders it for mode "solo", so it needs a type.
declare module "*/App.jsx" {
  import type { ComponentType } from "react";
  const App: ComponentType;
  export default App;
}
