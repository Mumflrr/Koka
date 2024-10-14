import './App.css'
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from './components/Home'  // Renamed from HomeComponent to match the actual export


function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path='/' element={<Home />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App