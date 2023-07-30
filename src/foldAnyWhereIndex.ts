import { Editor, MarkdownView, Plugin } from 'obsidian';
import FoldingExtension, { foldAll, unfoldAll } from "./foldAnywhereWidget";
import { foldAllPlugin } from "./foldWidget";

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
	}

}
