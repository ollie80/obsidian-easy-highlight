import { Plugin, PluginSettingTab, Setting, TextComponent, MarkdownView, Menu, Editor } from "obsidian";

// Interface for the plugin settings
interface EasyHighlightSettings {
	colors: string[];
}

// Default settings
const DEFAULT_SETTINGS: EasyHighlightSettings = {
	colors: [],
};

export default class EasyHighlight extends Plugin {
	settings: EasyHighlightSettings;

	async onload(): Promise<void> {
		// Load settings
		await this.loadSettings();

		// Add the settings tab
		this.addSettingTab(new EasyHighlightSettingTab(this.app, this));

		// Add the right-click context menu option
		this.registerEvent(this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
			menu.addItem((item) => {
				item
					.setTitle("Highlight")
					.setIcon("highlighter")
					.onClick(() => {
						this.highlightSelectedText(view);
					});
			});
			
		}));

		this.addCommand({
			id: 'highlight-selected-text',
			name: 'Highlight Selected Text',
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					if (!checking) {
						this.highlightSelectedText(activeView);
					}
					return true;
				}
				return false;
			},
		});

		
	}

	// Load the plugin settings
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	// Save the plugin settings
	async saveSettings() {
		await this.saveData(this.settings);
	}

	private highlightSelectedText(view: MarkdownView) {
		const editor = view.editor;
		const selectedText = editor.getSelection();
		
		if (selectedText) {
			// Check if the selected text is within a <mark> element
			const lineNumber = editor.getCursor().line;
			const lineContent = editor.getLine(lineNumber);
			const markRegex = /<mark[^>]*>(.*?)<\/mark>/g;
	
			let match;
			let isHighlight = false;
			const marksToRemove: [number, number][] = []; // Store positions of marks to remove
	
			// Check each <mark> element in the current line
			while ((match = markRegex.exec(lineContent)) !== null) {
				const markStartIndex = match.index;
				const markEndIndex = markStartIndex + match[0].length;
	
				// Check if the selected text intersects with the <mark> element
				const selectedStart = editor.getCursor('from').ch;
				const selectedEnd = editor.getCursor('to').ch;
	
				if ((selectedStart < markEndIndex && selectedEnd > markStartIndex)) {
					isHighlight = true; // There is a highlight present
					marksToRemove.push([markStartIndex, markEndIndex]); // Store the start and end of the <mark> to remove
				}
			}
	
			if (isHighlight) {
				// Remove the existing highlights
				marksToRemove.forEach(([start, end]) => {
					const markContent = lineContent.slice(start, end);
					const unmarkedContent = markContent.replace(/<\/?mark[^>]*>/g, ''); // Remove <mark> tags
					editor.replaceRange(unmarkedContent, { line: lineNumber, ch: start }, { line: lineNumber, ch: end });
				});
			} else {
				// Count the number of <mark> elements in the file
				const markCount = this.countMarkElements(view);
				const indexOffset = this.getColorIndexOffset(view);				
				const colorIndex = indexOffset + markCount % this.settings.colors.length; // Ensure we stay within bounds
				
				const highlightColor = this.settings.colors[colorIndex]; // Select color based on mark count
				

				if (markCount === 0) {
					const highlightedText = `<mark highlightindex="${indexOffset}" style="background-color: ${highlightColor};">${selectedText}</mark>`;
					editor.replaceSelection(highlightedText); // Apply new highlight

				} else {
					const highlightedText = `<mark style="background-color: ${highlightColor};">${selectedText}</mark>`;
					editor.replaceSelection(highlightedText); // Apply new highlight

				}
			}
		}
		
	}
	
	getRandomBetween(min: number, max: number): number {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
	

	// Function to count the <mark> elements in the active file
	private countMarkElements(view: MarkdownView): number {
		const content = view.data;
		
		const markElements = content.match(/<mark[^>]*>(.*?)<\/mark>/g); // Match all <mark> elements
		return markElements ? markElements.length : 0; // Return the count or 0 if none found
	}

	private getColorIndexOffset(view: MarkdownView): number  {
		const editor = view.editor;
		const content = editor.getValue(); // Get the entire content of the current file
	
		// Regular expression to find the first <mark> element with a highlightindex attribute
		const markRegex = /<mark[^>]*highlightindex=["']?(\d+)["']?[^>]*>/;
	
		const match = markRegex.exec(content);
	
		if (match && match[1]) {
			return parseInt(match[1], 10) | 0; // Return the highlightindex value as a number
		}
		
		return this.getRandomBetween(0, this.settings.colors.length);

	}
	

	rgbToHex({ r, g, b }: { r: number, g: number, b: number }): string {
		const toHex = (c: number) => c.toString(16).padStart(2, '0');
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	}
	
	hexToRGB(hex: string): { r: number, g: number, b: number } {
		let trimmedHex = hex.replace(/^#/, '');
	
		if (trimmedHex.length === 3) {
			trimmedHex = trimmedHex.split('').map(c => c + c).join('');
		}
	
		const bigint = parseInt(trimmedHex, 16);
		return {
			r: (bigint >> 16) & 255,
			g: (bigint >> 8) & 255,
			b: bigint & 255,
		};
	}
	
	rgbToHue({ r, g, b }: { r: number, g: number, b: number }): number {
		const rr = r / 255, gg = g / 255, bb = b / 255;
		const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
		let h = 0;
	
		if (max === min) {
			h = 0;
		} else if (max === rr) {
			h = (60 * ((gg - bb) / (max - min)) + 360) % 360;
		} else if (max === gg) {
			h = (60 * ((bb - rr) / (max - min)) + 120) % 360;
		} else if (max === bb) {
			h = (60 * ((rr - gg) / (max - min)) + 240) % 360;
		}
	
		return h;
	}
	
	sortColorsByBlueToRed(colors: string[]): string[] {
		return colors
			.map(hex => ({ hex, rgb: this.hexToRGB(hex) })) // Convert to RGB
			.sort((colorA, colorB) => {
				const hueA = this.rgbToHue(colorA.rgb);
				const hueB = this.rgbToHue(colorB.rgb);
	
				// Sort by hue descending to go from blue (240) to red (0 or 360)
				return hueB - hueA;
			})
			.map(color => this.rgbToHex(color.rgb)); // Convert back to hex
	}
	
}

class EasyHighlightSettingTab extends PluginSettingTab {
	plugin: EasyHighlight;

	constructor(app: any, plugin: EasyHighlight) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Easy Highlight Settings' });

		// Add the button to add a new color at the top
		new Setting(containerEl)
			.setName('Add New Color')
			.addButton((button) => {
				button.setButtonText('Add').setCta().onClick(async () => {
					this.plugin.settings.colors.push("#ffffff");  // Add new color
					this.plugin.settings.colors = this.plugin.sortColorsByBlueToRed(this.plugin.settings.colors)
					await this.plugin.saveSettings();
					this.display();  // Re-render the settings
					
				});
			});

		// Loop through the colors and display them
		this.plugin.settings.colors.forEach((color, index) => {
			new Setting(containerEl)
				.setName(`Color ${index + 1}`)
				.setDesc('Pick a color for highlighting')
				.addText((text: TextComponent) => {
					text.setValue(color)
						.onChange((value) => {
							this.plugin.settings.colors[index] = value; // Update value on change
						});

					// Add the blur event to save when losing focus
					text.inputEl.addEventListener('blur', async () => {
						this.plugin.settings.colors[index] = text.getValue(); // Save when losing focus
						this.plugin.settings.colors.sort(); // Sort colors in ascending order
						await this.plugin.saveSettings();
					});
				})
				.addExtraButton((btn) => {
					btn.setIcon("none")  // Set an icon for the color preview
						.setTooltip("Color preview")
						.onClick(() => { /* No action needed, just a preview */ });

					// Set the color preview via CSS style
					const previewEl = btn.extraSettingsEl;
					previewEl.style.backgroundColor = color;
					previewEl.style.borderRadius = "50%";
					previewEl.style.width = "30px";
					previewEl.style.height = "30px";
				})
				.addButton((button) => {
					button.setButtonText("Delete")
						.onClick(async () => {
							this.plugin.settings.colors.splice(index, 1);
							await this.plugin.saveSettings();
							this.display(); // Re-render the settings after delete
						});
				});
		});
	}
}
