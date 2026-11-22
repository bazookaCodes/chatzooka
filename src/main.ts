import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import CardWindow from "./CardWindow.svelte";
import { cardTargetFromUrl } from "./lib/card/protocol";

// A user card window loads this same page with ?card=… (see chat/userCard.svelte.ts).
const card = cardTargetFromUrl();
const target = document.getElementById("app")!;
const app = card ? mount(CardWindow, { target, props: { target: card } }) : mount(App, { target });

export default app;
