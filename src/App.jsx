import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState("");
  const [isScraping, setIsScraping] = useState(false);

  useEffect(() => {
    const unsubscribe = listen("scrape_result", (event) => {
      const result = event.payload;
      if (result === null) {
        setScrapeStatus("Scrape completed successfully!");
      } else {
        setScrapeStatus(`Error during scrape: ${result}`);
      }
      setIsScraping(false);
    });

    return () => {
      unsubscribe.then(f => f());
    };
  }, []);

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  async function schedulerScrape() {
    setIsScraping(true);
    setScrapeStatus("Scraping in progress...");
    try {
      await invoke("scheduler_scrape");
    } catch (error) {
      setScrapeStatus(`Error starting scrape: ${error}`);
      setIsScraping(false);
    }
  }

  return (
    <div className="container">
      <h1>Welcome to Tauri!</h1>

      <div className="row">
        <a href="https://vitejs.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://reactjs.org" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>

      <p>{greetMsg}</p>

      <div className="row">
        <button onClick={schedulerScrape} disabled={isScraping}>
          {isScraping ? "Scraping..." : "Start Scrape"}
        </button>
      </div>

      <p>{scrapeStatus}</p>
    </div>
  );
}

export default App;