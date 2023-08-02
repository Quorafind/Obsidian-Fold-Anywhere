import {
	addIcon,
	App,
	ButtonComponent,
	Editor,
	MarkdownView,
	Menu,
	MenuItem,
	Modal,
	Notice,
	Plugin,
	Setting
} from 'obsidian';
import FoldingExtension, { foldAll, unfoldAll } from "./widgets/foldAnywhereWidget";
import { foldAllPlugin } from "./widgets/foldWidget";
import { foldable } from "@codemirror/language";

export default class MyPlugin extends Plugin {

	async onload() {
		this.registerIcons();
		this.registerCommands();
		this.registerContextMenu();
		this.registerEditorExtension(FoldingExtension);
		this.registerEditorExtension(foldAllPlugin(this.app));
	}

	onunload() {

	}

	registerIcons() {
		addIcon('fold-horizontal', `<g xmlns="http://www.w3.org/2000/svg" id="surface1"><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 1.999687 12 L 7.999687 12 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 22.000312 12 L 16.000312 12 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 1.999687 L 12 4.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 7.999687 L 12 10.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 13.999688 L 12 16.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 19.999688 L 12 22.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 19.000312 9 L 16.000312 12 L 19.000312 15 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 4.999687 15 L 7.999687 12 L 4.999687 9 " transform="matrix(4.166667,0,0,4.166667,0,0)"/></g>`)
	}

	registerCommands() {
		this.addCommand({
		    id: 'fold-current-range',
		    name: 'Fold Between Start and End Marks',
		    editorCallback: (editor: Editor, view: MarkdownView) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const editorView = (editor as any).cm;
                foldAll(editorView);

				const selection = editor.getCursor("from");
				const linePos = editor.posToOffset(selection);
				const foldRegion = foldable((editor as any).cm.state, linePos, linePos);
		    }
		});

		this.addCommand({
			id: 'unfold-current-range',
            name: 'Unfold Between Start and End Marks',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const editorView = (editor as any).cm;
                unfoldAll(editorView);
            }
		});

		this.addCommand({
		    id: 'fold-selected-text',
		    name: 'Fold Selected Text',
		    editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();

				if(!selection.trim()) return;

				editor.replaceSelection(` %% REGION %% ${selection} %% ENDREGION %% `)
				foldAll((editor as any).cm);
		    }
		});

		this.addCommand({
		    id: 'mark-as-start',
		    name: 'Mark as Start',
		    editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();

				if(selection.trim()) return;

				editor.replaceSelection(` %% REGION %% `);
		    }
		});

		this.addCommand({
			id: 'mark-as-end',
			name: 'Mark as End',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();

				if(selection.trim()) return;

				editor.replaceSelection(` %% ENDREGION %% `);
			}
		});

		this.addCommand({
		    id: 'remove-all-markers',
		    name: 'Remove All Markers In Current File',
			// Using callback instead of checkCallback because we want to using async/await
		    callback: async () => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const file = markdownView.file;
					let ready = false;
					new AskModal(this.app, async (ready: boolean) => {
						ready = ready;
						if (ready) {
							const fileContent = await this.app.vault.cachedRead(file);
							const newFileContent = fileContent.replace(/(\s)?%% REGION %%|(\s)?%% ENDREGION %%/g, '');
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
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				if (!editor) {
					return;
				}
				const selection = editor.getSelection();

				menu.addItem((item: MenuItem) => {
					// @ts-ignore
					const subMenu = item.setSection('action').setTitle(`Fold AnyWhere`).setIcon('chevrons-right-left').setSubmenu();
					subMenu.addItem((item: MenuItem) => {
						item.setIcon('fold-horizontal')
							.setTitle('Fold Selected Text')
							.setDisabled(!selection.trim())
							.onClick(() => {
								// Check if the head is line start
								const cursor = editor.getCursor("from");
								const lineStart = cursor.ch === 0;

								editor.replaceSelection((lineStart ? ` ` : ``) + `%% REGION %% ${selection} %% ENDREGION %% `);
								editor.setCursor(cursor.line, cursor.ch + 14);
								foldAll((editor as any).cm);
							})
					})
					subMenu.addItem((item: MenuItem) => {
						item.setIcon('chevron-last')
							.setTitle('Mark as Start')
							.setDisabled(!!selection.trim())
							.onClick(() => {
								if(!selection.trim()) return;
								editor.replaceSelection(` %% REGION %% `);
							})
					})
					subMenu.addItem((item: MenuItem) => {
						item.setIcon('chevron-first')
							.setTitle('Mark as End')
							.setDisabled(!!selection.trim())
							.onClick(() => {
								if(!selection.trim()) return;
								editor.replaceSelection(` %% REGION %% `);
							})
					})

				})
			}))
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
