import { useState } from "react";
import "../../App.css";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Settings.module.css"; // We will use this for our modal styles

// Import our new API
import { credentialsAPI } from "../../api";

function Settings() {
    // State for the forms
    const [masterPassword, setMasterPassword] = useState("");
    const [apiKey, setApiKey] = useState("");
    
    // State for user feedback
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // State for the authorization modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalPassword, setModalPassword] = useState("");
    const [modalResolve, setModalResolve] = useState(null);

    const clearMessages = () => {
        setMessage("");
        setError("");
    };

    const handleSetMasterPassword = async (e) => {
        e.preventDefault();
        clearMessages();
        if (masterPassword.length < 8) {
            setError("Master password must be at least 8 characters long.");
            return;
        }
        try {
            await credentialsAPI.setupMasterPassword(masterPassword);
            setMessage("Master password set successfully!");
            setMasterPassword("");
        } catch (err) {
            setError(`Failed to set master password: ${err}`);
        }
    };
    
    const handleStoreApiKey = async (e) => {
        e.preventDefault();
        clearMessages();
        if (!apiKey) {
            setError("API Key field cannot be empty.");
            return;
        }
        try {
            // We give our secret a name, e.g., 'user_api_key'
            await credentialsAPI.storeSecret('user_api_key', apiKey);
            setMessage("API Key stored securely!");
            setApiKey("");
        } catch (err) {
            setError(`Failed to store API Key: ${err}`);
        }
    };

    // This function shows the modal and returns a Promise
    const promptForMasterPassword = () => {
        return new Promise((resolve) => {
            setIsModalOpen(true);
            setModalResolve(() => resolve); // Store the resolve function
        });
    };

    const handleModalSubmit = () => {
        if (modalResolve) {
            modalResolve(modalPassword); // Resolve the promise with the password
        }
        closeModal();
    };
    
    const handleModalCancel = () => {
        if (modalResolve) {
            modalResolve(null); // Resolve with null to indicate cancellation
        }
        closeModal();
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalPassword("");
        setModalResolve(null);
    };

    // This is the main function demonstrating the secure flow
    const handleFetchAndUseKey = async () => {
        clearMessages();
        try {
            // 1. Prompt the user for their master password using our modal
            const enteredPassword = await promptForMasterPassword();
            
            if (enteredPassword === null) {
                setMessage("Operation cancelled by user.");
                return;
            }

            // 2. Send the password to the backend to get the key
            const retrievedApiKey = await credentialsAPI.getSecretWithAuthorization('user_api_key', enteredPassword);
            
            // 3. Use the key and show a success message
            setMessage(`Success! Retrieved API Key: ${retrievedApiKey.substring(0, 8)}...`);

            // In a real app, you would now use `retrievedApiKey` for a network request
            // and then let it go out of scope. Do not store it in component state.
            console.log("Retrieved Key:", retrievedApiKey);

        } catch(err) {
            setError(`Error: ${err}`);
        }
    };

    return (
        <>
            <Sidebar />
            <div className={ss.settingsContainer}>
                <h1>Security Settings</h1>
                
                {message && <p className={ss.successMessage}>{message}</p>}
                {error && <p className={ss.errorMessage}>{error}</p>}
                
                <div className={ss.formSection}>
                    <h2>Master Password</h2>
                    <p>This password protects your stored credentials. You'll need it to access them.</p>
                    <form onSubmit={handleSetMasterPassword}>
                        <input
                            type="password"
                            value={masterPassword}
                            onChange={(e) => setMasterPassword(e.target.value)}
                            placeholder="Enter new master password"
                        />
                        <button type="submit">Set Master Password</button>
                    </form>
                </div>

                <div className={ss.formSection}>
                    <h2>Store API Key</h2>
                    <p>Enter an API key to be stored securely in your operating system's keychain.</p>
                    <form onSubmit={handleStoreApiKey}>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Paste your API Key here"
                        />
                        <button type="submit">Store API Key</button>
                    </form>
                </div>

                <div className={ss.formSection}>
                    <h2>Test Credential Access</h2>
                    <p>Click the button below to test the secure retrieval process.</p>
                    <button onClick={handleFetchAndUseKey}>Fetch and Use API Key</button>
                </div>
            </div>

            {isModalOpen && (
                <div className={ss.modalOverlay}>
                    <div className={ss.modalContent}>
                        <h3>Authorization Required</h3>
                        <p>Enter your master password to continue.</p>
                        <input
                            type="password"
                            value={modalPassword}
                            onChange={(e) => setModalPassword(e.target.value)}
                            onKeyUp={(e) => e.key === 'Enter' && handleModalSubmit()}
                            autoFocus
                        />
                        <div className={ss.modalActions}>
                            <button onClick={handleModalCancel}>Cancel</button>
                            <button onClick={handleModalSubmit} className={ss.primaryButton}>Unlock</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default Settings;