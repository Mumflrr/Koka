import { useState, useEffect } from "react";
import "../../App.css";
import Sidebar from "../Sidebar/Sidebar";
import ss from "./Settings.module.css";
import { credentialsAPI } from "../../api";

/**
 * A secure settings component that handles two states:
 * 1. Initial Setup: If no master password is set, it prompts the user to create one.
 * 2. Management: If a master password exists, it displays all management options.
 */
function Settings() {
    // State to track if setup is complete: null = loading, false = needs setup, true = setup complete
    const [isSetupComplete, setIsSetupComplete] = useState(null);

    // State for the initial setup form
    const [initialPassword, setInitialPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // State for the management forms
    const [oldMasterPassword, setOldMasterPassword] = useState("");
    const [newMasterPassword, setNewMasterPassword] = useState("");
    const [username, setUsername] = useState("");
    const [appPassword, setAppPassword] = useState("");

    // State for user feedback and the authorization modal
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalPassword, setModalPassword] = useState("");
    const [modalResolve, setModalResolve] = useState(null);

    // Check setup status when the component mounts
    useEffect(() => {
        const checkSetup = async () => {
            clearMessages();
            try {
                const isSet = await credentialsAPI.isMasterPasswordSet();
                setIsSetupComplete(isSet);
            } catch (err) {
                setError(`Critical error checking security status: ${err}`);
                setIsSetupComplete(false); // Default to setup mode on error
            }
        };
        checkSetup();
    }, []);

    const clearMessages = () => {
        setMessage("");
        setError("");
    };

    // --- Action Handlers ---

    const handleInitialSetup = async (e) => {
        e.preventDefault();
        clearMessages();
        
        // REMOVED: Password length check.

        if (initialPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        try {
            await credentialsAPI.setupMasterPassword(initialPassword);
            setMessage("Master password set successfully! You can now use the security features.");
            setInitialPassword("");
            setConfirmPassword("");
            setIsSetupComplete(true); // Transition to the management view
        } catch (err) {
            setError(`Failed to set master password: ${err}`);
        }
    };

    const handleChangeMasterPassword = async (e) => {
        e.preventDefault();
        clearMessages();

        // REMOVED: New password length check.

        if (!oldMasterPassword) {
            setError("You must provide your current master password to change it.");
            return;
        }
        try {
            await credentialsAPI.changeMasterPassword(oldMasterPassword, newMasterPassword);
            setMessage("Master password changed successfully!");
            setOldMasterPassword("");
            setNewMasterPassword("");
        } catch (err) {
            setError(`Failed to change master password: ${err}`);
        }
    };
    
    const handleStoreCredentials = async (e) => {
        e.preventDefault();
        clearMessages();
        if (!username || !appPassword) {
            setError("Username and Password fields cannot be empty.");
            return;
        }
        try {
            const masterPassword = await promptForMasterPassword();
            if (masterPassword === null) {
                setMessage("Operation cancelled.");
                return;
            }
            await credentialsAPI.storeCredentials(username, appPassword, masterPassword);
            setMessage("Credentials stored securely!");
            setUsername("");
            setAppPassword("");
        } catch (err) {
            setError(`Failed to store credentials: ${err}`);
        }
    };

    // --- Modal Logic ---

    const promptForMasterPassword = () => {
        return new Promise((resolve) => {
            setIsModalOpen(true);
            setModalResolve(() => resolve);
        });
    };
    const handleModalSubmit = () => { if (modalResolve) modalResolve(modalPassword); closeModal(); };
    const handleModalCancel = () => { if (modalResolve) modalResolve(null); closeModal(); };
    const closeModal = () => { setIsModalOpen(false); setModalPassword(""); setModalResolve(null); };

    // --- Render Logic ---

    const renderLoading = () => <p>Checking security status...</p>;

    const renderInitialSetup = () => (
        <div className={ss.formSection}>
            <h2>Create Master Password</h2>
            <p>Welcome! Please create a master password to secure your application data. This password cannot be recovered, so store it safely.</p>
            <form onSubmit={handleInitialSetup}>
                <input type="password" value={initialPassword} onChange={(e) => setInitialPassword(e.target.value)} placeholder="Enter Master Password" autoFocus />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm Master Password" />
                <button type="submit">Create Password</button>
            </form>
        </div>
    );

    const renderManagement = () => (
        <>
            <div className={ss.formSection}>
                <h2>Change Master Password</h2>
                <p>To change your master password, provide the current and new one.</p>
                <form onSubmit={handleChangeMasterPassword}>
                    <input type="password" value={oldMasterPassword} onChange={(e) => setOldMasterPassword(e.target.value)} placeholder="Current Master Password" />
                    <input type="password" value={newMasterPassword} onChange={(e) => setNewMasterPassword(e.target.value)} placeholder="New Master Password" />
                    <button type="submit">Change Password</button>
                </form>
            </div>
            <div className={ss.formSection}>
                <h2>Store Login Credentials</h2>
                <p>Store a username and password. Requires master password authorization.</p>
                <form onSubmit={handleStoreCredentials} className={ss.inputGroup}>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter Username" />
                    <input type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder="Enter Password" />
                    <button type="submit">Store Credentials</button>
                </form>
            </div>
        </>
    );

    return (
        <>
            <Sidebar />
            <main className={ss.settingsContainer}>
                <h1>Security Settings</h1>
                {message && <p className={ss.successMessage}>{message}</p>}
                {error && <p className={ss.errorMessage}>{error}</p>}
                
                {isSetupComplete === null ? renderLoading() : !isSetupComplete ? renderInitialSetup() : renderManagement()}
            </main>
            {isModalOpen && (
                <div className={ss.modalOverlay}>
                    <div className={ss.modalContent}>
                        <h3>Authorization Required</h3>
                        <p>Enter your master password to continue.</p>
                        <input type="password" value={modalPassword} onChange={(e) => setModalPassword(e.target.value)} onKeyUp={(e) => e.key === 'Enter' && handleModalSubmit()} autoFocus />
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