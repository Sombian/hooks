import React from "react";
import ReactDOM from "react-dom/client";

import useSyncState from "@/react/useSyncState";

function App()
{
	const [foo, setFoo] = useSyncState("test", 0);
	const [bar, setBar] = useSyncState("test", 5);

	return (
		<main>
			<div>
				foo={foo}
			</div>
			<div>
				bar={bar}
			</div>
			<div onClick={() => setFoo((_) => _ + 1)}>
				foo::increase
			</div>
			<div onClick={() => setFoo((_) => _ - 1)}>
				foo::decrease
			</div>
			<div onClick={() => setBar((_) => _ + 1)}>
				bar::increase
			</div>
			<div onClick={() => setBar((_) => _ - 1)}>
				bar::decrease
			</div>
		</main>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
