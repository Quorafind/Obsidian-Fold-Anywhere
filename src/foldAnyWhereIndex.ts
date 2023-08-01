import { addIcon, Editor, MarkdownView, Plugin } from 'obsidian';
import FoldingExtension, { foldAll, unfoldAll } from "./widgets/foldAnywhereWidget";
import { foldAllPlugin } from "./widgets/foldWidget";
import { foldable } from "@codemirror/language";

export default class MyPlugin extends Plugin {

	async onload() {
		this.registerCommands();
		this.registerEditorExtension(FoldingExtension);
		this.registerEditorExtension(foldAllPlugin(this.app));
	}

	onunload() {

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
		    id: 'fold-selected-range',
		    name: 'Fold Selected Range',
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
	}



}
