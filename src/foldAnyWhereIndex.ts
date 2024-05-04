import {
	addIcon,
	App,
	ButtonComponent, debounce,
	Editor,
	MarkdownView,
	Menu,
	MenuItem,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab, Setting
} from 'obsidian';
import FoldingExtension, { foldAll, unfoldAll } from "./widgets/foldService";
import { foldAllPlugin } from "./widgets/foldMarkerWidget";
import { dealWithSelection, insertMark } from "./utils/line";

export interface FoldAnyWhereSettings {
	startMarker: string;
	endMarker: string;
}

const DEFAULT_SETTINGS: FoldAnyWhereSettings = {
	startMarker: '%% REGION %%',
	endMarker: '%% ENDREGION %%'
};

export default class FoldAnyWherePlugin extends Plugin {
	private settingTab: FoldAnywhereSettingTab;
	settings: FoldAnyWhereSettings;

	async onload() {

		await this.loadSettings();
		this.addSettingTab(new FoldAnywhereSettingTab(this.app, this));
		this.registerIcons();
		this.registerCommands();
		this.registerContextMenu();
		this.registerEditorExtension([FoldingExtension, foldAllPlugin(this.app, this)]);
	}

	onunload() {

	}

	registerIcons() {
		addIcon('fold-horizontal', `<g xmlns="http://www.w3.org/2000/svg" id="surface1"><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 1.999687 12 L 7.999687 12 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 22.000312 12 L 16.000312 12 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 1.999687 L 12 4.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 7.999687 L 12 10.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 13.999688 L 12 16.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 19.999688 L 12 22.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 19.000312 9 L 16.000312 12 L 19.000312 15 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 4.999687 15 L 7.999687 12 L 4.999687 9 " transform="matrix(4.166667,0,0,4.166667,0,0)"/></g>`);
	}

	registerCommands() {
		this.addCommand({
			id: 'fold-current-range',
			name: 'Fold between start and end marks',
			editorCallback: (editor: Editor) => {
				const editorView = (editor as any).cm;
				foldAll(editorView);
			}
		});

		this.addCommand({
			id: 'unfold-current-range',
			name: 'Unfold between start and end marks',
			editorCallback: (editor: Editor) => {
				const editorView = (editor as any).cm;
				unfoldAll(editorView);
			}
		});

		this.addCommand({
			id: 'fold-selected-text',
			name: 'Fold selected text',
			editorCallback: (editor: Editor) => dealWithSelection(this.settings, editor)
		});

		this.addCommand({
			id: 'mark-as-start',
			name: 'Mark as start',
			editorCallback: (editor: Editor) => insertMark(this.settings, editor, 'start')
		});

		this.addCommand({
			id: 'mark-as-end',
			name: 'Mark as end',
			editorCallback: (editor: Editor) => insertMark(this.settings, editor, 'end')
		});

		this.addCommand({
			id: 'remove-all-markers',
			name: 'Remove All Markers In Current File',
			// Using callback instead of checkCallback because we want to using async/await
			callback: async () => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const file = markdownView.file;
					if (!file) return;
					let ready = false;
					new AskModal(this.app, async (already: boolean) => {
						ready = already;
						if (ready) {
							const fileContent = await this.app.vault.cachedRead(file);
							const startMarker = this.settings.startMarker;
							const endMarker = this.settings.endMarker;

							const regex = new RegExp(`(\\s)?${startMarker}|(\\s)?${endMarker}`, 'g');
							const newFileContent = fileContent.replace(regex, '');
							await this.app.vault.modify(file, newFileContent);
						}
					}).open();
					return;
				}
				new Notice('No active file open');
			}
		});
	}

	registerContextMenu() {
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
				if (!editor) {
					return;
				}
				const selection = editor.getSelection();

				menu.addItem((item: MenuItem) => {
					// @ts-ignore
					const subMenu = item.setSection('action').setTitle(`Fold anywhere`).setIcon('chevrons-right-left').setSubmenu();
					subMenu.addItem((item: MenuItem) => {
						item.setIcon('fold-horizontal')
							.setTitle('Fold selected text')
							.setDisabled(!selection.trim())
							.onClick(() => dealWithSelection(this.settings, editor));
					});
					subMenu.addItem((item: MenuItem) => {
						item.setIcon('chevron-last')
							.setTitle('Mark as start')
							.setDisabled(!!selection.trim())
							.onClick(() => insertMark(this.settings, editor, 'start'));
					});
					subMenu.addItem((item: MenuItem) => {
						item.setIcon('chevron-first')
							.setTitle('Mark as end')
							.setDisabled(!!selection.trim())
							.onClick(() => insertMark(this.settings, editor, 'end'));
					});

				});
			}));
	}

	public async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

class AskModal extends Modal {
	private cb: (ready: boolean) => Promise<void>;

	constructor(app: App, cb: (ready: boolean) => Promise<void>) {
		super(app);
		this.cb = cb;
	}

	onOpen() {
		let {contentEl} = this;
		contentEl.toggleClass('fold-anywhere-ask-modal', true);
		contentEl.createEl('div', {text: 'Are you sure?'});
		const buttonContainer = contentEl.createDiv({cls: 'button-container'});

		new ButtonComponent(buttonContainer).setClass('remove-ready').setWarning().setButtonText('Yes').onClick(async () => {
			await this.cb(true);
			this.close();
		});
		new ButtonComponent(buttonContainer).setClass('do-not-remove').setButtonText('No').onClick(async () => {
			await this.cb(false);
			this.close();
		});
	}
}

export class FoldAnywhereSettingTab extends PluginSettingTab {
	plugin: FoldAnyWherePlugin;

	constructor(app: App, plugin: FoldAnyWherePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	debounceApplySettingsUpdate = debounce(
		async () => {
			await this.plugin.saveSettings();
		},
		200,
		true,
	);

	debounceDisplay = debounce(
		async () => {
			await this.display();
		},
		400,
		true,
	);

	applySettingsUpdate() {
		this.debounceApplySettingsUpdate();
	}

	async display() {
		await this.plugin.loadSettings();

		const {containerEl} = this;
		const settings = this.plugin.settings;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Fold anywhere start marker')
			.addText(text => text.setValue(settings.startMarker).onChange(async (value) => {
				settings.startMarker = value;
				this.applySettingsUpdate();
			}));

		new Setting(containerEl)
			.setName('Fold anywhere end marker')
			.addText(text => text.setValue(settings.endMarker).onChange(async (value) => {
				settings.endMarker = value;
				this.applySettingsUpdate();
			}));
	}
}
