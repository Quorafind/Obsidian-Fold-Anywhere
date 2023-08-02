// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as obsidian from 'obsidian';

declare module "obsidian" {
    interface Editor {
        cm: any;
    }
}
