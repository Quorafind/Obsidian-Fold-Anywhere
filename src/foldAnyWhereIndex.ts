import {
	addIcon,
	App,
	ButtonComponent,
	debounce,
	Editor,
	editorInfoField,
	MarkdownView,
	Menu,
	MenuItem,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import FoldingExtension, {
	foldAll,
	unfoldAll,
	foldAllRegions,
	foldAllLineRegions,
	reconfigureFoldAnywhere,
	loadFoldAnyWhereSettings,
	foldRangesStateField,
} from "./widgets/foldService";
import { foldAllPlugin } from "./widgets/foldMarkerWidget";
import { dealWithSelection, insertMark } from "./utils/line";
import { around } from "monkey-around";
import { foldEffect } from "@codemirror/language";

export interface FoldAnyWhereSettings {
	startMarker: string;
	endMarker: string;
	lineFoldMarker: string;
	lineFoldEndMarker: string;
	autoFoldOnLoad: boolean;
}

const DEFAULT_SETTINGS: FoldAnyWhereSettings = {
	startMarker: "%% REGION %%",
	endMarker: "%% ENDREGION %%",
	lineFoldMarker: "%% LINEFOLDSTART %%",
	lineFoldEndMarker: "%% LINEFOLDEND %%",
	autoFoldOnLoad: true,
};

// Define interfaces for the fold info structure
interface FoldRange {
	from: number; // line number
	to: number; // line number
}

interface AwFoldRange {
	awFoldFrom: number;
	awFoldTo: number;
}

interface FoldInfo {
	folds: FoldRange[];
	lines: number;
}

interface FoldInfoWithAwFolds extends FoldInfo {
	awFolds: (AwFoldRange | FoldRange)[];
}

// Type for editor view with showEditor method
interface EditableView {
	editable: boolean;
	showEditor: () => void;
	unload: () => void;
	editMode: any;
}

export default class FoldAnyWherePlugin extends Plugin {
	settings: FoldAnyWhereSettings;
	private editorPatcher: (() => void) | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FoldAnywhereSettingTab(this.app, this));
		this.registerIcons();
		this.registerCommands();
		this.registerContextMenu();
		this.registerEditorExtension([
			FoldingExtension,
			foldAllPlugin(this.app, this),
			loadFoldAnyWhereSettings(this.settings),
		]);

		// Patch Obsidian's native folding methods
		this.patchObsidianFoldMethods();

		this.app.workspace.onLayoutReady(() => {
			this.iterateCM6((view) => {
				view.dispatch({
					effects: reconfigureFoldAnywhere(this.settings),
				});

				// Auto-fold all regions on load if enabled
				if (this.settings.autoFoldOnLoad) {
					const currentSavedFolds =
						this.app.loadLocalStorage(`aw-folds`);

					if (currentSavedFolds) {
						const parsedFolds = JSON.parse(currentSavedFolds);

						const file = view.state.field(editorInfoField).file;

						console.log(parsedFolds, file);
						if (!file) return;
						const foldsOfFile = parsedFolds[file.path];
						if (foldsOfFile) {
							for (const fold of foldsOfFile) {
								const realFold = {
									from: fold.awFoldFrom,
									to: fold.awFoldTo,
								};
								view.dispatch({
									effects: foldEffect.of(realFold),
								});
							}
						}
					} else {
						foldAllRegions(view);
					}
				}
			});

			// Also register an event to auto-fold regions when opening new files
			this.registerEvent(
				this.app.workspace.on("file-open", () => {
					// Only auto-fold if the setting is enabled
					if (this.settings.autoFoldOnLoad) {
						// Small delay to ensure editor is fully loaded
						setTimeout(() => {
							this.iterateCM6((view) => {
								foldAllRegions(view);
							});
						}, 200);
					}
				})
			);
		});
	}

	onunload() {
		// Uninstall any patches
		if (this.editorPatcher) {
			this.editorPatcher = null;
		}
	}

	/**
	 * Patches Obsidian's native folding methods to handle inline folding
	 */
	patchObsidianFoldMethods() {
		try {
			// Create a temporary MarkdownView to access the editor prototype
			const tempViewEl = document.createElement("div");
			// Using private Obsidian API - must use `any` type to access private properties
			const app = this.app as any;
			if (!app.embedRegistry) {
				console.warn(
					"Cannot patch folding methods: embedRegistry not found"
				);
				return;
			}
			const tempView = app.embedRegistry.embedByExtension.md(
				{ app: this.app, containerEl: tempViewEl },
				null as unknown as TFile,
				""
			) as unknown as EditableView;
			// Ensure the view is editable
			if (tempView) {
				tempView.editable = true;
				tempView.showEditor();
				// Get the editor prototype
				const editorPrototype = Object.getPrototypeOf(
					Object.getPrototypeOf(tempView.editMode)
				);
				// Now patch the getFoldInfo and applyFoldInfo methods
				this.editorPatcher = around(
					editorPrototype.constructor.prototype,
					{
						getFoldInfo: (next) => {
							return function () {
								try {
									// Call the original method
									const foldInfo = next.apply(this);

									// Get awFolds from localStorage
									const awFolds: AwFoldRange[] = [];
									if (this.cm) {
										try {
											// Get current file path to use as key
											const currentFile =
												this.owner?.file?.path;
											const currentFoldRanges =
												this.cm.state.field(
													foldRangesStateField
												);
											for (const fold of currentFoldRanges) {
												awFolds.push({
													awFoldFrom: fold.from,
													awFoldTo: fold.to,
												});
											}
											if (currentFile) {
												// First read existing fold data
												let allFolds = {};
												const storedFolds =
													app.loadLocalStorage(
														`aw-folds`
													);
												if (storedFolds) {
													try {
														allFolds = JSON.parse(
															storedFolds
														) as Record<
															string,
															AwFoldRange[]
														>;
													} catch (e) {
														console.warn(
															"Error parsing stored folds:",
															e
														);
													}
												}
												// Create fold data for current file
												const fileFolds = awFolds.map(
													(fold) => ({
														awFoldFrom:
															fold.awFoldFrom,
														awFoldTo: fold.awFoldTo,
													})
												);

												// Update the map with current file's folds
												(
													allFolds as Record<
														string,
														AwFoldRange[]
													>
												)[currentFile] = fileFolds;

												// Save all folds back to localStorage
												app.saveLocalStorage(
													`aw-folds`,
													JSON.stringify(allFolds)
												);
											}
										} catch (storageError) {
											console.warn(
												"Error loading fold data from localStorage:",
												storageError
											);
										}
									}

									// If we have any custom folds, add them to the result
									if (foldInfo && awFolds.length > 0) {
										// Filter out any folds that match our awFolds to avoid duplicates
										const newFolds = foldInfo.folds.filter(
											(fold: FoldRange) => {
												return !awFolds.some(
													(awFold) => {
														return (
															this.cm.state.doc.lineAt(
																awFold.awFoldFrom
															).number -
																1 ===
																fold.from &&
															this.cm.state.doc.lineAt(
																awFold.awFoldTo
															).number -
																1 ===
																fold.to
														);
													}
												);
											}
										);
										// Add our awFolds to the final result
										foldInfo.folds = [...newFolds];
									}

									return foldInfo;
								} catch (error) {
									console.warn(
										"Error in getFoldInfo, providing fallback:",
										error
									);
									// Return null as a fallback when an error occurs
									return null;
								}
							};
						},
						applyFoldInfo: (next) => {
							return function (e: FoldInfoWithAwFolds | null) {
								// Only proceed if we have valid fold info
								if (!e) return;
								try {
									// Call the original method with our sanitized data
									const result = next.apply(this, [
										e.folds.filter((fold) => {
											return !("awFoldFrom" in fold);
										}),
									]);

									const codemirror: EditorView = this.cm;

									// After applying folds, also collect all active awFolds
									try {
										if (codemirror) {
											try {
												// Save the fold data to localStorage
												const currentFile =
													this.owner?.file?.path;
												if (currentFile) {
													// First read existing fold data

													const storedFolds =
														app.loadLocalStorage(
															`aw-folds`
														);

													if (storedFolds) {
														try {
															const parsedFolds =
																JSON.parse(
																	storedFolds
																);

															// Check if the file exists in the stored folds
															if (
																parsedFolds[
																	currentFile
																]
															) {
																// Get the folds for the current file
																const fileFolds =
																	parsedFolds[
																		currentFile
																	];
																for (const fold of fileFolds) {
																	this.cm.dispatch(
																		{
																			effects:
																				[
																					foldEffect.of(
																						{
																							from: fold.awFoldFrom as number,
																							to: fold.awFoldTo as number,
																						}
																					),
																				],
																		}
																	);
																}
															}
														} catch (parseError) {
															console.warn(
																"Error parsing fold data:",
																parseError
															);
														}
													}
												}
											} catch (rangeError) {
												console.warn(
													"Error applying plugin fold ranges:",
													rangeError
												);
											}
										}
									} catch (awError) {
										console.warn(
											"Error handling awFolds:",
											awError
										);
									}

									return result;
								} catch (error) {
									console.warn(
										"Error in applyFoldInfo:",
										error
									);
									// Don't proceed when an error occurs
									return;
								}
							};
						},
					}
				);
				// Clean up the temporary view
				tempView.unload();
				tempViewEl.remove();
				this.register(this.editorPatcher);
			}
		} catch (error) {
			console.error("Failed to patch Obsidian folding methods:", error);
		}
	}

	registerIcons() {
		addIcon(
			"fold-horizontal",
			`<g xmlns="http://www.w3.org/2000/svg" id="surface1"><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 1.999687 12 L 7.999687 12 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 22.000312 12 L 16.000312 12 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 1.999687 L 12 4.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 7.999687 L 12 10.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 13.999688 L 12 16.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 12 19.999688 L 12 22.000312 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 19.000312 9 L 16.000312 12 L 19.000312 15 " transform="matrix(4.166667,0,0,4.166667,0,0)"/><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:rgb(0%,0%,0%);stroke-opacity:1;stroke-miterlimit:4;" d="M 4.999687 15 L 7.999687 12 L 4.999687 9 " transform="matrix(4.166667,0,0,4.166667,0,0)"/></g>`
		);
	}

	registerCommands() {
		this.addCommand({
			id: "fold-current-range",
			name: "Fold between start and end marks",
			editorCallback: (editor: Editor) => {
				const editorView = (editor as any).cm;
				foldAll(editorView);
			},
		});

		this.addCommand({
			id: "unfold-current-range",
			name: "Unfold between start and end marks",
			editorCallback: (editor: Editor) => {
				const editorView = (editor as any).cm;
				unfoldAll(editorView);
			},
		});

		this.addCommand({
			id: "fold-all-regions",
			name: "Fold all regions in file",
			editorCallback: (editor: Editor) => {
				const editorView = (editor as any).cm;
				foldAllRegions(editorView);
			},
		});

		this.addCommand({
			id: "fold-selected-text",
			name: "Fold selected text",
			editorCallback: (editor: Editor) =>
				dealWithSelection(this.settings, editor),
		});

		this.addCommand({
			id: "mark-as-start",
			name: "Mark as start",
			editorCallback: (editor: Editor) =>
				insertMark(editor, this.settings.startMarker),
		});

		this.addCommand({
			id: "mark-as-line-fold",
			name: "Mark as line fold",
			editorCallback: (editor: Editor) =>
				insertMark(editor, this.settings.lineFoldMarker),
		});

		this.addCommand({
			id: "mark-as-end",
			name: "Mark as end",
			editorCallback: (editor: Editor) =>
				insertMark(editor, this.settings.endMarker),
		});

		this.addCommand({
			id: "remove-all-markers",
			name: "Remove All Markers In Current File",
			// Using callback instead of checkCallback because we want to using async/await
			callback: async () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const file = markdownView.file;
					if (!file) return;
					let ready = false;
					new AskModal(this.app, async (already: boolean) => {
						ready = already;
						if (ready) {
							const fileContent = await this.app.vault.cachedRead(
								file
							);
							const startMarker = this.settings.startMarker;
							const endMarker = this.settings.endMarker;

							const regex = new RegExp(
								`(\\s)?${startMarker}|(\\s)?${endMarker}`,
								"g"
							);
							const newFileContent = fileContent.replace(
								regex,
								""
							);
							await this.app.vault.modify(file, newFileContent);
						}
					}).open();
					return;
				}
				new Notice("No active file open");
			},
		});

		this.addCommand({
			id: "fold-anywhere-fold-all-line-regions",
			name: "Fold all line regions",
			editorCallback: (editor: Editor) => {
				const view = (editor as any).cm as EditorView;
				foldAllLineRegions(view);
			},
		});
	}

	registerContextMenu() {
		this.registerEvent(
			this.app.workspace.on(
				"editor-menu",
				(menu: Menu, editor: Editor) => {
					if (!editor) {
						return;
					}
					const selection = editor.getSelection();

					menu.addItem((item: MenuItem) => {
						// Create a submenu
						const subMenu = new Menu();

						// Add items to the submenu
						if (selection) {
							subMenu.addItem((subItem: MenuItem) =>
								subItem
									.setTitle("Fold selected text")
									.setIcon("fold-horizontal")
									.onClick(async () => {
										dealWithSelection(
											this.settings,
											editor
										);
									})
							);
						}

						subMenu.addItem((subItem: MenuItem) =>
							subItem
								.setTitle("Mark as start")
								.setIcon("fold-horizontal")
								.onClick(async () => {
									insertMark(
										editor,
										this.settings.startMarker
									);
								})
						);

						subMenu.addItem((subItem: MenuItem) =>
							subItem
								.setTitle("Mark as line fold")
								.setIcon("fold-horizontal")
								.onClick(async () => {
									insertMark(
										editor,
										this.settings.lineFoldMarker
									);
								})
						);

						subMenu.addItem((subItem: MenuItem) =>
							subItem
								.setTitle("Mark as end")
								.setIcon("fold-horizontal")
								.onClick(async () => {
									insertMark(editor, this.settings.endMarker);
								})
						);

						// Set up the main menu item to show the submenu
						item.setSection("action")
							.setTitle(`Fold anywhere`)
							.setIcon("chevrons-right-left")
							.onClick(() => {
								// Just show the submenu at a default position
								const position = { x: 0, y: 0 };

								// Get mouse position if possible
								const mouseEvent =
									this.app.workspace.containerEl
										.querySelector(".menu")
										?.getBoundingClientRect();
								if (mouseEvent) {
									position.x = mouseEvent.left;
									position.y = mouseEvent.bottom;
								}

								subMenu.showAtPosition(position);
							});
					});
				}
			)
		);
	}

	// Iterate through all MarkdownView leaves and execute a callback function on each
	iterateCM6(callback: (editor: EditorView) => unknown) {
		this.app.workspace.iterateAllLeaves((leaf) => {
			leaf?.view instanceof MarkdownView &&
				(leaf.view.editor as any)?.cm instanceof EditorView &&
				callback((leaf.view.editor as any).cm);
		});
	}

	public async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update settings in all editor instances using the state effect
		this.iterateCM6((view) => {
			view.dispatch({
				effects: reconfigureFoldAnywhere(this.settings),
			});
		});
	}
}

class AskModal extends Modal {
	private cb: (ready: boolean) => Promise<void>;

	constructor(app: App, cb: (ready: boolean) => Promise<void>) {
		super(app);
		this.cb = cb;
	}

	onOpen() {
		let { contentEl } = this;
		contentEl.toggleClass("fold-anywhere-ask-modal", true);
		contentEl.createEl("div", { text: "Are you sure?" });
		const buttonContainer = contentEl.createDiv({
			cls: "button-container",
		});

		new ButtonComponent(buttonContainer)
			.setClass("remove-ready")
			.setWarning()
			.setButtonText("Yes")
			.onClick(async () => {
				await this.cb(true);
				this.close();
			});
		new ButtonComponent(buttonContainer)
			.setClass("do-not-remove")
			.setButtonText("No")
			.onClick(async () => {
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
		true
	);

	debounceDisplay = debounce(
		async () => {
			await this.display();
		},
		400,
		true
	);

	applySettingsUpdate() {
		this.debounceApplySettingsUpdate();
	}

	async display() {
		await this.plugin.loadSettings();

		const { containerEl } = this;
		const settings = this.plugin.settings;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Fold anywhere start marker")
			.addText((text) =>
				text.setValue(settings.startMarker).onChange(async (value) => {
					settings.startMarker = value;
					this.applySettingsUpdate();
				})
			);

		new Setting(containerEl)
			.setName("Fold anywhere end marker")
			.addText((text) =>
				text.setValue(settings.endMarker).onChange(async (value) => {
					settings.endMarker = value;
					this.applySettingsUpdate();
				})
			);

		new Setting(containerEl)
			.setName("Line fold start marker")
			.addText((text) =>
				text
					.setValue(settings.lineFoldMarker)
					.onChange(async (value) => {
						settings.lineFoldMarker = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Line fold end marker")
			.addText((text) =>
				text
					.setValue(settings.lineFoldEndMarker)
					.onChange(async (value) => {
						settings.lineFoldEndMarker = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Auto-fold regions on load")
			.setDesc("Automatically fold all regions when opening files")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.autoFoldOnLoad)
					.onChange(async (value) => {
						settings.autoFoldOnLoad = value;
						this.applySettingsUpdate();
					})
			);
	}
}
