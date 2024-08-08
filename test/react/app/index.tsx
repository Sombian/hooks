import React from "react";
import ReactDOM from "react-dom/client";

import useSyncState from "@/react/useSyncState";

function App()
{
	const [foo, setFoo] = useSyncState("test", 1.0);
	const [bar, setBar] = useSyncState("test", 0.5);

	return (
		<main>
			<div>
				foo={foo}
			</div>
			<div>
				bar={bar}
			</div>
			<div onClick={() => setFoo((_) => _ + 1)}>
				increase
			</div>
			<div onClick={() => setFoo((_) => _ - 1)}>
				decrease
			</div>
		</main>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
