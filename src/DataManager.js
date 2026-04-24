import { getByPath, setByPath, removeByPath } from './helpers/pathHelpers.js';

export default class DataManager {
    constructor(configJson) {
        this.config = configJson; //loaded from AssetManager
        this.data = {};
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
    saveData(filename = 'saveData.json', token = 'saveData') {
        const data = this.getData(token);
        const dataStr = JSON.stringify(data);
        localStorage.setItem(filename, dataStr);
    }
    async loadData(filename = 'saveData.json', token = 'saveData') {
        const dataStr = localStorage.getItem(filename);
        if (dataStr) {
            this.setData(token, JSON.parse(dataStr));
        } else {
            console.warn(`No save data found for ${filename}`);
        }
    }
}