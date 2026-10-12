/** Stable image names shared by normal, enlarged and bulk downloads. */
export function plotImageName(parameter: string, file: string, variant?: string) {
  const clean = (value: string) => value.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '_').replace(/^_+|_+$/g, '')
  const param = clean(parameter.replace(/\s*[([][^)\]]*[)\]]/g, '').toLowerCase()) || 'plot'
  const stem = clean(file.replace(/\.(xlsx?|csv|txt|dat)$/i, '')) || 'results'
  return `${param}_${stem}${variant ? `_${clean(variant.toLowerCase())}` : ''}`
}