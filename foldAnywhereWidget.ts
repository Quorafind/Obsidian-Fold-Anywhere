import { foldService, foldNodeProp, foldEffect, unfoldEffect } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, MatchDecorator, WidgetType } from '@codemirror/view';
import { EditorState, StateField } from "@codemirror/state";

// 定义小部件
class RegionFoldWidget extends WidgetType {
	constructor(readonly from: number, readonly to: number) {
		super();
	}

	eq(other: RegionFoldWidget) {
		return other.from === this.from && other.to === this.to;
	}

	toDOM() {
		const el = document.createElement("span");
		el.innerText = "…";
		el.className = "cm-foldPlaceholder";
		el.addEventListener("click", (evt) => {
			this.unfold(evt);
		});
		return el;
	}

	unfold(event) {
		event.view.dispatch({ effects: unfoldEffect.of({ from: this.from, to: this.to }) });
	}
}

export function regionFoldPlugin() {
	// 使用 MatchDecorator 搜索区域标签
	const decorator = new MatchDecorator({
		regexp: /%% REGION %%([\s\S]*?)%% ENDREGION %%/g,
		decoration: (match, view) => {
			const from = match.index;
			const to = from + match[0].length;
			return Decoration.replace({
				widget: new RegionFoldWidget(from, to),
			});
		}
	});

	// 定义一个服务，当 foldService 被请求时使用
	const regionFoldService = (state, lineStart, lineEnd) => {
		const doc = state.doc;
		const line = doc.lineAt(lineStart);
		const lineContent = line.text;

		if (lineContent.includes("%% REGION %%")) {
			let depth = 1;
			for (let i = line.number + 1; i <= doc.lines; i++) {
				const checkLine = doc.line(i).text;
				if (checkLine.includes("%% REGION %%")) {
					depth++;
				} else if (checkLine.includes("%% ENDREGION %%")) {
					depth--;
					if (depth === 0) {
						return { from: line.from, to: doc.line(i).to };
					}
				}
			}
		}
		return null;
	};

	return [
		foldService.of(regionFoldService),
		foldNodeProp.add((type) => {
			return (node, state) => {
				const from = node.from, to = node.to;
				const content = state.sliceDoc(from, to);
				if (content.startsWith("%% REGION %%") && content.endsWith("%% ENDREGION %%")) {
					return { from, to };
				}
				return null;
			};
		}),
		StateField.define<DecorationSet>({
			create: (state: EditorState) => decorator.createDeco(state),  // or whatever is correct for createDeco
			update(value, tr) {
				return value;
			}
		})
	];
}
