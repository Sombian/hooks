import React from "react";
import ReactDOM from "react-dom/client";

import useSyncState from "@/react/useSyncState";

function App()
{
	const [foo, setFoo] = useSyncState("test", 0);
	const [bar, setBar] = useSyncState("test", 5);

	return (
		<main>
			<table border={1}>
				<thead>
					<th>foo</th>
					<th>bar</th>
				</thead>
				<tbody>
					<tr>
						<td>{foo}</td>
						<td>{bar}</td>
					</tr>
				</tbody>
			</table>
			<div>
				<button onClick={() => setFoo((_) => _ + 1)}>
					foo::increase
				</button>
				<button onClick={() => setFoo((_) => _ - 1)}>
					foo::decrease
				</button>
			</div>
			<div>
				<button onClick={() => setBar((_) => _ + 1)}>
					bar::increase
				</button>
				<button onClick={() => setBar((_) => _ - 1)}>
					bar::decrease
				</button>
			</div>
		</main>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
