# Product Scope Decision: Hair Consultation

**Status:** Accepted for the current product roadmap  
**Decision:** Do not build generative hairstyle try-on in the current release scope.

## Product direction

Keep hair guidance as a consultation feature, not an image-generation feature. The goal is to help users shortlist realistic hairstyle and hair-color options they can discuss with a stylist.

## In scope

1. **Hairstyle guidance**
   - Curated hairstyle catalog with reference photos and descriptive tags.
   - Filters and explanations based on user-selected preferences and cautiously estimated face-shape tendencies.
   - Practical attributes such as length, layers, fringe, texture, styling effort, and maintenance.

2. **Hair-color guidance**
   - Curated, named color families and reference swatches.
   - Practical descriptions: depth, warmth/coolness, maintenance, bleaching requirement, and color-fade expectations.
   - Suggestions may use the existing color-analysis result as one input, but must disclose uncertainty and allow users to override it.

3. **User control and transparency**
   - Let users edit or skip face-shape assumptions.
   - Avoid presenting one hairstyle or hair color as objectively correct.
   - Show reference images as inspiration, not as a promise of the exact salon result.

## Explicitly out of scope

- Generative hairstyle replacement / face-preserving hairstyle synthesis.
- AI-generated previews that imply a guaranteed real-world salon outcome.
- Hair segmentation and automatic recoloring in the initial consultation release.

These may be reconsidered only if there is a clear user need, a viable implementation that preserves identity and image quality, and a validation plan using real hair types, textures, lengths, and lighting conditions.

## Suggested delivery order

1. Build a structured hairstyle and hair-color catalog.
2. Implement transparent filtering and recommendation explanations.
3. Add saved preferences and compare shortlisted references.
4. Evaluate demand before considering any image-editing or generative capability.

## Quality bar

A useful, honest shortlist is preferable to a visually impressive but unreliable generated image. The feature should help users make a better salon decision without overstating what the app can predict.
