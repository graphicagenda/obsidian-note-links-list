import { 
    Plugin, 
    WorkspaceLeaf, 
    MarkdownView, 
    ItemView, 
    addIcon
} from 'obsidian';

// Define the view type for our sidebar
const VIEW_TYPE_LINK_LIST = "link-list-view";

// Interface for storing link information
interface LinkInfo {
    url: string; 
    tags: string[];
    lineNumber: number;
}

// Custom view for the sidebar
class LinkListView extends ItemView {
    private links: LinkInfo[] = [];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_LINK_LIST;
    }

    getDisplayText(): string {
        return "Note Links";
    }

    // Update the list of links
    updateLinks(newLinks: LinkInfo[]) {
        this.links = newLinks;
        this.render();
    }

    // Render the view
    async render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl('h4', { text: 'Links in Current Note' });

        if (this.links.length === 0) {
            container.createEl('p', { text: 'No links found in the current note.' });
            return;
        }

        const linkList = container.createEl('ul');
        linkList.addClass('link-list');

        for (const link of this.links) {
            const linkItem = linkList.createEl('li');
            const linkText = linkItem.createEl('a', {
                text: link.url,
                href: link.url
            });
            
            // Make the link clickable
            linkText.addEventListener('click', (e) => {
                e.preventDefault();
                window.open(link.url, '_blank');
            });

            // Display tags if present
            if (link.tags.length > 0) {
                const tagContainer = linkItem.createEl('span', {
                    cls: 'link-tags'
                });
                tagContainer.style.marginLeft = '10px';
                tagContainer.style.color = 'var(--text-muted)';
                tagContainer.textContent = link.tags.join(', ');
            }
        }
    }
}

// Main plugin class
export default class LinkViewerPlugin extends Plugin {
    private view: LinkListView;

    async onload() {
        // Register the custom view type
        this.registerView(
            VIEW_TYPE_LINK_LIST,
            (leaf: WorkspaceLeaf) => (this.view = new LinkListView(leaf))
        );

        // Add the view to the right sidebar
        this.addRibbonIcon('links', 'Show Note Links', async () => {
            await this.activateView();
        });

        // Register event handler for active leaf changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async () => {
                await this.updateLinkList();
            })
        );

        // Register event handler for file changes
        this.registerEvent(
            this.app.workspace.on('editor-change', async () => {
                await this.updateLinkList();
            })
        );

        // Initial view activation
        await this.activateView();
    }

    async onunload() {
        // Remove the view when the plugin is disabled
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_LINK_LIST);
    }

    // Extract links and tags from the current note
    private extractLinksAndTags(content: string): LinkInfo[] {
        const links: LinkInfo[] = [];
        const lines = content.split('\n');
        
        // Regular expressions for matching URLs and tags
        const urlRegex = /(https?:\/\/[^\s\]]+)/g;
        const tagRegex = /#[\w-]+/g;

        lines.forEach((line, index) => {
            const urlMatches = line.match(urlRegex);
            if (urlMatches) {
                const tags = (line.match(tagRegex) || [])
                    .map(tag => tag.substring(1));

                urlMatches.forEach(url => {
                    links.push({
                        url: url,
                        tags: tags,
                        lineNumber: index + 1
                    });
                });
            }
        });

        return links;
    }

    // Update the link list based on the active note
    private async updateLinkList() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        
        if (activeView) {
            const content = activeView.getViewData();
            const links = this.extractLinksAndTags(content);
            this.view?.updateLinks(links);
        }
    }

    // Activate the sidebar view
    private async activateView() {
        const { workspace } = this.app;

        // If the view is already active in the sidebar, do nothing
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_LINK_LIST)[0];
        
        if (!leaf) {
            // Create a new leaf in the right sidebar
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_LINK_LIST,
                active: true,
            });
        }

        // Reveal the leaf in the right sidebar
        workspace.revealLeaf(leaf);
        
        // Update the link list
        await this.updateLinkList();
    }
}

// Add CSS styles
const styles = `
.link-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.link-list li {
    padding: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
}

.link-list li:last-child {
    border-bottom: none;
}

.link-list a {
    color: var(--text-accent);
    text-decoration: none;
    word-break: break-all;
}

.link-list a:hover {
    text-decoration: underline;
}

.link-tags {
    font-size: 0.85em;
    opacity: 0.8;
}
`;