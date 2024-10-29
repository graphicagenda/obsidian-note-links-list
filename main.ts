import { 
    Plugin, 
    WorkspaceLeaf, 
    MarkdownView, 
    ItemView, 
    addIcon,
    Editor
} from 'obsidian';

// Define the view type for our sidebar
const VIEW_TYPE_LINK_LIST = "link-list-view";

// Custom icon for the view
const LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;

// Jump to icon
const JUMP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;

// Interface for storing link information
interface LinkInfo {
    url: string;
	displayUrl: string;
    tags: string[];
    position: {
        from: {
            line: number;
            ch: number;
        };
        to: {
            line: number;
            ch: number;
        };
    };
    isFromFrontmatter: boolean;
    propertyKey?: string;
}

// URL processing utilities
const commonTLDs = new Set([
    'com', 'net', 'org', 'edu', 'gov', 'mil',
    'io', 'ai', 'app', 'dev', 'cloud',
    'co', 'me', 'info', 'biz', 'tech',
    'blog', 'design', 'store', 'shop',
    'uk', 'us', 'eu', 'ca', 'au', 'de', 'fr'
]);

function standardizeUrl(url: string): { standardized: string, display: string } | undefined {
    const display = url; // Keep original for display
    
    // If it already has a protocol, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return { standardized: url, display };
    }

    // Extract the domain and TLD
    const domainParts = url.split('/')[0].split('.');
    const tld = domainParts[domainParts.length - 1].toLowerCase();

    // Validate if it's likely a real URL by checking TLD
    if (commonTLDs.has(tld)) {
        // Add https:// prefix for the standardized version
        return { 
            standardized: 'https://' + url,
            display
        };
    }

    // If not valid, return null
    return undefined;
}

// Custom view for the sidebar
class LinkListView extends ItemView {
	private frontmatterLinks: LinkInfo[] = [];
    private noteLinks: LinkInfo[] = [];
    private filterDuplicates: boolean = false;
	private plugin: LinkViewerPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: LinkViewerPlugin) {
        super(leaf);
		this.plugin = plugin;
        this.filterDuplicates = plugin.settings.filterDuplicates;
    }

    getViewType(): string {
        return VIEW_TYPE_LINK_LIST;
    }

    getDisplayText(): string {
        return "Note Links";
    }

    getIcon(): string {
        return "link";
    }

	updateLinks(frontmatterLinks: LinkInfo[], noteLinks: LinkInfo[]) {
        this.frontmatterLinks = frontmatterLinks;
        this.noteLinks = noteLinks;
        this.render();
    }

	// Modified to ensure filtering happens
	private filterLinks(frontmatterLinks: LinkInfo[], noteLinks: LinkInfo[]): { frontmatter: LinkInfo[], note: LinkInfo[] } {
		if (!this.filterDuplicates) {
			return { frontmatter: frontmatterLinks, note: noteLinks };
		}

		// Track all URLs we've seen across both sections
		const seenUrls = new Set<string>();
		const filteredFrontmatter: LinkInfo[] = [];
		const filteredNote: LinkInfo[] = [];

		// First process frontmatter links
		for (const link of frontmatterLinks) {
			const standardizedUrl = link.url.toLowerCase(); // Case-insensitive comparison
			if (!seenUrls.has(standardizedUrl)) {
				seenUrls.add(standardizedUrl);
				filteredFrontmatter.push(link);
			}
		}

		// Then process note links, still checking against the same seenUrls set
		for (const link of noteLinks) {
			const standardizedUrl = link.url.toLowerCase(); // Case-insensitive comparison
			if (!seenUrls.has(standardizedUrl)) {
				seenUrls.add(standardizedUrl);
				filteredNote.push(link);
			}
		}

		return {
			frontmatter: filteredFrontmatter,
			note: filteredNote
		};
	}

	// Jump to specific position in editor
	jumpToPosition(position: { from: { line: number, ch: number }, to: { line: number, ch: number } }) {
		// First, make sure we have the active markdown view
		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		
		// If no active markdown view, find one and activate it
		if (!activeView) {
			const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
			if (markdownLeaves.length > 0) {
				this.app.workspace.setActiveLeaf(markdownLeaves[0]);
				activeView = markdownLeaves[0].view as MarkdownView;
			}
		}
		
		if (!activeView?.editor) return;
		
		const editor = activeView.editor;
		
		// Move cursor and select the text
		const from = {
			line: position.from.line,
			ch: position.from.ch
		};
		
		const to = {
			line: position.to.line,
			ch: position.to.ch
		};

		// Set cursor position and selection
		editor.setCursor(from);
		editor.setSelection(from, to);
		
		// Scroll the selected text into view
		editor.scrollIntoView({ from, to }, true);

		// Activate and focus the editor
		activeView.leaf.setEphemeralState({ focus: true });
		editor.focus();
	}

	private async renderFilterCheckbox(container: HTMLElement) {
        const checkboxContainer = container.createEl('div', {
            cls: 'filter-checkbox-container'
        });

        const checkbox = checkboxContainer.createEl('input', {
            type: 'checkbox',
            cls: 'filter-checkbox'
        });
        checkbox.checked = this.filterDuplicates;

        const label = checkboxContainer.createEl('label', {
            text: 'Show only first instance of each link',
            cls: 'filter-checkbox-label'
        });

        checkbox.addEventListener('change', async (e) => {
            this.filterDuplicates = checkbox.checked;
            this.plugin.settings.filterDuplicates = checkbox.checked;
            await this.plugin.saveSettings();
            // Force immediate re-render with current data
            this.render();
        });
    }

	private renderLinkSection(container: HTMLElement, title: string, links: LinkInfo[], showJumpButton: boolean) {
        if (!links || links.length === 0) return;

        const sectionTitle = container.createEl('h4', { text: title });
        sectionTitle.addClass('link-section-title');

        const linkList = container.createEl('ul');
        linkList.addClass('link-list');

        for (const link of links) {
            const listItem = linkList.createEl('li');
            listItem.addClass('link-item');

            const innerContainer = listItem.createEl('div', {
                cls: 'link-inner-container'
            });

            if (showJumpButton) {
                const jumpButton = innerContainer.createEl('button', {
                    cls: 'jump-to-button'
                });
                jumpButton.innerHTML = JUMP_ICON;
                jumpButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.jumpToPosition(link.position);
                });
            }

            const linkEl = innerContainer.createEl('a', {
                cls: 'link-text',
                href: link.url,
                text: link.displayUrl
            });
            
            linkEl.addEventListener('click', (e) => {
                e.preventDefault();
                window.open(link.url, '_blank');
            });

            if (link.isFromFrontmatter && link.propertyKey) {
                const propertyKey = innerContainer.createEl('span', {
                    cls: 'property-key',
                    text: link.propertyKey
                });
            }

            if (link.tags.length > 0) {
                const tagContainer = innerContainer.createEl('span', {
                    cls: 'link-tags',
                    text: link.tags.join(', ')
                });
            }
        }
    }

    // Render the view
	async render() {
        const container = this.containerEl.children[1] as HTMLDivElement;
        if (!container) return;
		
        container.empty();

        // Add the filter checkbox at the top
        await this.renderFilterCheckbox(container);

        // Get filtered links using the current state
        const { frontmatter, note } = this.filterLinks(this.frontmatterLinks, this.noteLinks);

        if (frontmatter.length === 0 && note.length === 0) {
            container.createEl('p', { text: 'No links found in the current note.' });
            return;
        }

        // Render sections with filtered links
        this.renderLinkSection(container, "File Property's Links", frontmatter, false);
        this.renderLinkSection(container, "Note's Links", note, true);
    }
}

// Add settings interface 
interface LinkViewerSettings {
    filterDuplicates: boolean;
}

// Default settings 
const DEFAULT_SETTINGS: LinkViewerSettings = {
    filterDuplicates: false
}

// Main plugin class
export default class LinkViewerPlugin extends Plugin {
    private view: LinkListView;
	settings: LinkViewerSettings;

    async onload() {
		// Load saved settings
		await this.loadSettings();
				
		// Load the custom styles
		this.registerStyles();

		// Add custom icon
		addIcon('link', LINK_ICON);

		// Register the custom view type
		// Modified view registration to make extractLink methods accessible
		this.registerView(
			VIEW_TYPE_LINK_LIST,
			(leaf: WorkspaceLeaf) => {
				this.view = new LinkListView(leaf, this);
				return this.view;
			}
		);

		// Add the view to the right sidebar
		this.addRibbonIcon('link', 'Show Note Links', async () => {
			await this.activateView();
		});

		// Register event handlers
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', async () => {
				await this.updateLinkList();
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-change', async () => {
				await this.updateLinkList();
			})
		);

        // Initial view activation
        await this.activateView();
    }

	async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_LINK_LIST);
    }

	private registerStyles() {
        // Add styles to document
        const styleEl = document.createElement('style');
        styleEl.id = 'link-viewer-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    // Extract links from frontmatter
	public extractFrontmatterLinks(editor: Editor): LinkInfo[] {
        const links: LinkInfo[] = [];
        const content = editor.getValue();
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const urlRegex = /(https?:\/\/[^\s\]]+)|(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})(?:\/[^\s\]]*)?/g;
            const lines = frontmatter.split('\n');
            
            lines.forEach((line, index) => {
                const propertyMatch = line.match(/^(\w+):\s*(.*)/);
                if (propertyMatch) {
                    const [, key, value] = propertyMatch;
                    let match;
                    while ((match = urlRegex.exec(value)) !== null) {
                        const matchedUrl = match[0];
                        const urlInfo = standardizeUrl(matchedUrl);
                        
                        if (urlInfo) {
                            // Add 1 to account for the opening '---'
                            const actualLineNumber = index + 1;
                            
                            links.push({
                                url: urlInfo.standardized,
                                displayUrl: urlInfo.display,
                                tags: [],
                                position: {
                                    from: { 
                                        line: actualLineNumber,
                                        ch: line.indexOf(matchedUrl)
                                    },
                                    to: { 
                                        line: actualLineNumber,
                                        ch: line.indexOf(matchedUrl) + matchedUrl.length
                                    }
                                },
                                isFromFrontmatter: true,
                                propertyKey: key
                            });
                        }
                    }
                }
            });
        }
        return links;
    }

    // Extract links from note content
	public extractNoteLinks(editor: Editor): LinkInfo[] {
        const links: LinkInfo[] = [];
        const content = editor.getValue();
        let contentStartLine = 0;
        
        const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
        if (frontmatterMatch) {
            contentStartLine = frontmatterMatch[0].split('\n').length - 1;
        }
        
        const lines = content.split('\n');
        const contentLines = lines.slice(contentStartLine);
        
        const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})(?:\/[^\s\]]*)?/g;
        const tagRegex = /#[\w-]+/g;

        contentLines.forEach((line, index) => {
            const actualLineNumber = index + contentStartLine;
            let match;
            
            while ((match = urlRegex.exec(line)) !== null) {
                const matchedUrl = match[0];
                const urlInfo = standardizeUrl(matchedUrl);
                
                if (urlInfo) {
                    const tags = (line.match(tagRegex) || [])
                        .map(tag => tag.substring(1));

                    links.push({
                        url: urlInfo.standardized,
                        displayUrl: urlInfo.display,
                        tags: tags,
                        position: {
                            from: { 
                                line: actualLineNumber, 
                                ch: match.index 
                            },
                            to: { 
                                line: actualLineNumber, 
                                ch: match.index + matchedUrl.length 
                            }
                        },
                        isFromFrontmatter: false
                    });
                }
            }
        });

        return links;
    } 

    // Update the link list based on the active note
	private async updateLinkList() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        
        if (activeView?.editor) {
            const frontmatterLinks = this.extractFrontmatterLinks(activeView.editor);
            const noteLinks = this.extractNoteLinks(activeView.editor);
            // Only update if we have a view
            // if (this.view) {
            //     this.view.updateLinks(frontmatterLinks, noteLinks);
            // }
			this.view.updateLinks(frontmatterLinks, noteLinks);
        }
    }

    // Activate the sidebar view
    private async activateView() { 
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_LINK_LIST)[0];
        
        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({
                    type: VIEW_TYPE_LINK_LIST,
                    active: true,
                });
            } else {
                leaf = workspace.getLeaf(true);
                await leaf.setViewState({
                    type: VIEW_TYPE_LINK_LIST,
                    active: true,
                });
            }
        }

        workspace.revealLeaf(leaf);
        await this.updateLinkList();
    }
}

// Add CSS styles
const styles = `
.filter-checkbox-container {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 15px;
    border-bottom: 1px solid var(--background-modifier-border);
}

.filter-checkbox {
    cursor: pointer;
}

.filter-checkbox-label {
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.9em;
}

/* Previous styles remain the same */
.link-section-title {
    margin-top: 16px;
    margin-bottom: 8px;
    font-size: 1.1em;
    color: var(--text-normal);
    border-bottom: 1px solid var(--background-modifier-border);
    padding-bottom: 4px;
}

.link-list.link-list {
    list-style: none;
    padding: 0;
    margin: 0;
    padding-left: 15px;
}

.link-item {
    padding: 4px;
    border-bottom: 1px solid var(--background-modifier-border);
}

.link-item:last-child {
    border-bottom: none;
}

.link-inner-container {
    display: flex;
    align-items: center;
    gap: 6px;
}

.jump-to-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 2px;
    width: 24px;
    height: 24px;
    cursor: pointer;
    color: var(--text-muted);
    flex-shrink: 0;
}

.jump-to-button:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
    border-radius: 4px;
}

.link-text {
    color: var(--text-accent);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
    min-width: 0;
}

.link-text:hover {
    text-decoration: underline;
}

.property-key {
    color: var(--text-muted);
    background-color: var(--background-modifier-hover);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.85em;
    flex-shrink: 0;
}

.link-tags {
    color: var(--text-muted);
    font-size: 0.85em;
    flex-shrink: 0;
}

.workspace-tab-header[data-type="${VIEW_TYPE_LINK_LIST}"] .workspace-tab-header-inner-icon svg {
    width: 20px;
    height: 20px;
}
`;