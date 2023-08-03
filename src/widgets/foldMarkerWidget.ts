import {
    Decoration,
    DecorationSet,
    EditorView,
    MatchDecorator,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from "@codemirror/view";
import { App, editorLivePreviewField, Menu, setIcon } from "obsidian";
import { foldAll } from "./foldService";

type MarkType = "fold" | "unfold";

class FoldMarkWidget extends WidgetType {
    isFolded: boolean;

    constructor(
        readonly app: App,
        readonly view: EditorView,
        readonly from: number,
        readonly to: number,
        readonly markType: MarkType = "fold",
        isFolded: boolean = false
    ) {
        super();
        this.isFolded = isFolded;
    }

    eq(other: FoldMarkWidget) {
        return other.view === this.view && other.from === this.from && other.to === this.to;
    }

    toDOM() {
        const creaseEl = createSpan("cm-fold-anywhere-icon");
        const iconEl = creaseEl.createSpan(this.markType === "fold" ? "fold-start" : "fold-end");

        let title: string, icon: string;
        if (this.markType === "fold") {
            title = "Remove Fold Start Mark";
            icon = this.isFolded ? "goal" : "chevron-last";
        } else {
            title = "Remove Fold End Mark";
            icon = "chevron-first";
        }
        setIcon(iconEl, icon);

        creaseEl.addEventListener("click", (evt) => {
            if (evt.ctrlKey || evt.metaKey) {
                const menu = new Menu();
                menu
                    .addItem((item) =>
                        item
                            .setTitle(title)
                            .setIcon("x")
                            .onClick(() => {
                                this.view.dispatch({
                                    changes: {
                                        from: this.from,
                                        to: this.to,
                                        insert: "",
                                    },
                                });
                            })
                    )
                    .showAtMouseEvent(evt);
                return;
            }
            this.view.dispatch({
                selection: { anchor: this.to || 0, head: this.to || 0 }
            });
            foldAll(this.view);
        });

        return creaseEl;
    }

    ignoreEvent(event:Event) {
        return false;
    }
}

export function foldAllPlugin(app: App) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet = Decoration.none;
            allDecos: DecorationSet = Decoration.none;
            decorator: MatchDecorator;

            constructor(public view: EditorView) {
                this.decorator = new MatchDecorator({
                    regexp: /\B%%\s+(REGION|ENDREGION)\s+%%\B/g,
                    decoration: this.getDeco.bind(this),
                });
                this.decorations = this.decorator.createDeco(view);
            }

            getDeco(match: RegExpExecArray, _view: EditorView, pos: number) {
                const from = pos;
                const to = pos + match[0].length;
                return Decoration.replace({
                    widget: new FoldMarkWidget(app, this.view, from, to, match[1] === "REGION" ? "fold" : "unfold"),
                });
            }

            update(update: ViewUpdate) {
                if (!update.state.field(editorLivePreviewField)) {
                    this.decorations = Decoration.none;
                    return;
                }

                this.decorations = this.decorator.updateDeco(update, this.decorations);
            }
        },
        {
            decorations: (v) => v.decorations,
            provide: plugin => EditorView.atomicRanges.of(view => {
                return view.plugin(plugin)?.decorations || Decoration.none
            })
        }
    );
}
