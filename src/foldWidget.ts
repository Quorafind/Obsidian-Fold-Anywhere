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
import { foldAll, unfoldAll } from "./foldAnywhereWidget";

type MarkType = "fold" | "unfold";

class FoldMarkWidget extends WidgetType {
    isFolded: boolean = false; // Add this line

    constructor(
        readonly app: App,
        readonly view: EditorView,
        readonly from: number,
        readonly to: number,
        readonly markType: MarkType = "fold",
        isFolded: boolean = false  // Add this line
    ) {
        super();
        this.isFolded = isFolded;  // Add this line
    }

    eq(other: FoldMarkWidget) {
        return other.view === this.view && other.from === this.from && other.to === this.to;
    }

    toDOM() {
        switch (this.markType) {
            case "fold": {
                const creaseEl = createSpan("cm-fold-all-icon");
                setIcon(creaseEl, this.isFolded ? "goal" : "flag-triangle-right");
                creaseEl.addEventListener("click", (evt) => {
                    if(evt.ctrlKey || evt.metaKey) {
                        const menu = new Menu();
                        menu
                            .addItem((item) =>
                                item
                                    .setTitle("Remove Fold Start Mark")
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
                    foldAll(this.view);
                });
                return creaseEl;
            }
            case "unfold": {
                const creaseEl = createSpan("cm-unfold-all-icon");
                setIcon(creaseEl, "flag-triangle-left");
                creaseEl.addEventListener("click", (evt) => {
                    unfoldAll(this.view);
                });
                return creaseEl;
            }
        }
    }

    ignoreEvent() {
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

//                 if (update.changes) {
//                     const folded = foldedRanges(update.state);
//
//                     let regions: { from: number, to: number }[] = [];
//
//                     this.decorations.between(0, update.state.doc.length, (from, to, { spec }) => {
//                         if (spec.widget && (spec.widget as any).markType) {
//                             const markType = (spec.widget as FoldMarkWidget).markType;
//                             if (markType === "fold") regions.push({ from: to, to: null });
//                             if (markType === "unfold" && regions.length > 0) regions[regions.length - 1].to = from;
//                         }
//                     });
//
//                     let newDecorations: { from: number, to: number, value: Decoration }[] = [];
//
//                     regions.forEach(region => {
//                         if(region.from !== null && region.to !== null) {
//                             let isFoldedWithin = false;
//
//                             folded.between(region.from, region.to, (foldFrom, foldTo) => {
//                                 isFoldedWithin = true;
//                             });
//
//                             const newDecoValue = Decoration.widget({
//                                 widget: new FoldMarkWidget(app, this.view, region.from, region.to, "fold", isFoldedWithin)
//                             });
//
//                             newDecorations.push({ from: region.from, to: region.to, value: newDecoValue });
//                         }
//                     });
//
// // Use update method of the DecorationSet
//                     this.decorations = this.decorations.update({
//                         add: newDecorations,
//                         filter: (_from, _to, decoration) => {
//                             return !decoration.spec.widget || !(decoration.spec.widget instanceof FoldMarkWidget)
//                         }
//                     });
//
//                 }

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
