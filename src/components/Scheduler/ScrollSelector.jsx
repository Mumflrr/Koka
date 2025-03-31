import { invoke } from "@tauri-apps/api/tauri";
import {useEffect} from 'react';
import ss from './ScrollSelector.module.css';


const ScrollSelector = ({numItems, handleItemClick}) => {

    // If items is empty or undefined, render nothing or a placeholder
    if (!numItems || numItems === 0) {
        return (
            <div className={ss['wrapper']}>
                <div className={ss['empty-message']}>No schedules available</div>
            </div>
        );
    }

    return (
        <div className={ss['wrapper']}>
            {Array.from({numItems}).map((_, i) => (
                <div key = {i} className={i === 0 ? ss['item-slot'] : ss['item-slot-first']}>
                    <button className={ss['item-button']} onClick={() => handleItemClick(i)}>Schedule {i}</button>
                </div>
            ))}
        </div>
    );
}

export default ScrollSelector;