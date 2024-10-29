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

// Custom view for the sidebar
class LinkListView extends ItemView {
    private frontmatterLinks: LinkInfo[] = [];
    private noteLinks: LinkInfo[] = [];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
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

    // Update the lists of links
    updateLinks(frontmatterLinks: LinkInfo[], noteLinks: LinkInfo[]) {
        this.frontmatterLinks = frontmatterLinks;
        this.noteLinks = noteLinks;
        this.render();
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

private renderLinkSection(container: HTMLElement, title: string, links: LinkInfo[], showJumpButton: boolean) {
	if (links.length === 0) return;

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
			text: link.url
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
        const container = this.containerEl.children[1];
        container.empty(); 

        if (this.frontmatterLinks.length === 0 && this.noteLinks.length === 0) {
            container.createEl('p', { text: 'No links found in the current note.' });
            return;
        }

        // Render frontmatter links section without jump button
        this.renderLinkSection(container, "File Property's Links", this.frontmatterLinks, false);

        // Render note links section with jump button
        this.renderLinkSection(container, "Note's Links", this.noteLinks, true);
    }
}

// Main plugin class
export default class LinkViewerPlugin extends Plugin {
    private view: LinkListView;

    async onload() {
		// Load the custom styles
        this.registerStyles();

        // Add custom icon
        addIcon('link', LINK_ICON);

        // Register the custom view type
        this.registerView(
            VIEW_TYPE_LINK_LIST,
            (leaf: WorkspaceLeaf) => (this.view = new LinkListView(leaf))
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
	private extractFrontmatterLinks(editor: Editor): LinkInfo[] {
        const links: LinkInfo[] = [];
        const content = editor.getValue();
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const urlRegex = /(https?:\/\/[^\s\]]+)/g;
            const lines = frontmatter.split('\n');
            
            lines.forEach((line, index) => {
                const propertyMatch = line.match(/^(\w+):\s*(.*)/);
                if (propertyMatch) {
                    const [, key, value] = propertyMatch;
                    let match;
                    while ((match = urlRegex.exec(value)) !== null) {
                        // Add 1 to account for the opening '---'
                        const actualLineNumber = index + 1;
                        
                        links.push({
                            url: match[0],
                            tags: [],
                            position: {
                                from: { 
                                    line: actualLineNumber,
                                    ch: line.indexOf(match[0])
                                },
                                to: { 
                                    line: actualLineNumber,
                                    ch: line.indexOf(match[0]) + match[0].length
                                }
                            },
                            isFromFrontmatter: true,
                            propertyKey: key
                        });
                    }
                }
            });
        }
		return links;
    }

    // Extract links from note content
	private extractNoteLinks(editor: Editor): LinkInfo[] {
        const links: LinkInfo[] = [];
        const content = editor.getValue();
        let contentStartLine = 0;
        
        // Find where the frontmatter ends, if it exists
        const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
        if (frontmatterMatch) {
            contentStartLine = frontmatterMatch[0].split('\n').length - 1;
        }
        
        // Get content lines after frontmatter
        const lines = content.split('\n');
        const contentLines = lines.slice(contentStartLine);
        
        const urlRegex = /(https?:\/\/[^\s\]]+)/g;
        const tagRegex = /#[\w-]+/g;

        contentLines.forEach((line, index) => {
            const actualLineNumber = index + contentStartLine;
            let match;
            
            while ((match = urlRegex.exec(line)) !== null) {
                const tags = (line.match(tagRegex) || [])
                    .map(tag => tag.substring(1));

                links.push({
                    url: match[0],
                    tags: tags,
                    position: {
                        from: { 
                            line: actualLineNumber, 
                            ch: match.index 
                        },
                        to: { 
                            line: actualLineNumber, 
                            ch: match.index + match[0].length 
                        }
                    },
                    isFromFrontmatter: false
                });
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
            this.view?.updateLinks(frontmatterLinks, noteLinks);
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

/* Increase the size of the view icon in the tab */
.workspace-tab-header[data-type="${VIEW_TYPE_LINK_LIST}"] .workspace-tab-header-inner-icon svg {
    width: 20px;
    height: 20px;
}
`;