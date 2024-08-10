import React from "react";
import ReactDOM from "react-dom/client";

import useQuery from "@/react/useQuery";
import useSyncState from "@/react/useSyncState";

function App()
{
	return (
		<main>
			<React.Suspense fallback="...">
				<UseQuery />
			</React.Suspense>
			<hr/>
			<React.Suspense fallback="...">
				<UseSyncState />
			</React.Suspense>
		</main>
	);
}

function UseQuery()
{
	throw new Promise(() => {});

	return (
		<>
			WIP
		</>
	);
}

function UseSyncState()
{
	const [foo, setFoo] = useSyncState("test", 0);
	const [bar, setBar] = useSyncState("test", 5);

	return (
		<>
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
		</>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
