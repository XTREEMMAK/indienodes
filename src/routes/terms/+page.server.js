import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import termsMarkdown from '../../../docs/legal/TERMS-AND-PRIVACY.md?raw';

/**
 * The published Terms of Use and Privacy Notice are authored in Markdown and
 * converted at build time. Only the rendered HTML reaches the browser.
 */
export async function load() {
	const file = await remark().use(remarkGfm).use(remarkHtml).process(termsMarkdown);
	return { termsHtml: String(file) };
}
