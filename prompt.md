the items in @app/(tabs)/library/watch-status.tsx dont show the title nor release year of the media which is bad UX, i want to include the title/name and the release year and rating (similar to how its layed out on the media cards on the index screen). however there are a few key differences i want to make:

1. the title/name should only span one line (numberOfLines={1})
2. I want to keep the 3 column layout as is
3. move the rating from the top right of the poster and put it next to the release year separated by a • (similar to the cards on the index screen)
