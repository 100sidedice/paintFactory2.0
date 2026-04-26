import { getByPath, setByPath, removeByPath } from '../Helpers/pathHelpers.js';

export default class DataManager {
    constructor(AssetManager) {
        this.AssetManager = AssetManager;
        this.config = AssetManager.get('config'); //loaded from AssetManager
        this.data = {};
        this.data["machineData"] = this.AssetManager.get('machineData'); // Preload machine data for easy access
    }
    getData(path){
        if (!path) return this.data;
        return getByPath(this.data, path);
    }
    setData(path, value){
        setByPath(this.data, path, value, true);
    }
    removeData(path){
        removeByPath(this.data, path);
    }
    saveData(token = 'saveData') {
        const data = this.getData(token);
        const dataStr = JSON.stringify(data);
        localStorage.setItem(this.config.saveData, dataStr);
    }
    async loadData(token = 'saveData') {
        const dataStr = localStorage.getItem(this.config.saveData);
        if (dataStr) {
            this.setData(token, JSON.parse(dataStr));
        } else {
            this.data[token] = this.config.defaultSaveData; // Initialize empty data if no save found
            console.warn(`No save data found for ${this.config.saveData}`);
        }
    }
}