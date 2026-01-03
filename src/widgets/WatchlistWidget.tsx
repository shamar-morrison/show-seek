import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';

interface WatchlistItem {
  id: number;
  title: string;
  posterPath: string;
  mediaType: 'movie' | 'tv';
}

interface WatchlistWidgetProps {
  items: WatchlistItem[];
  size: 'small' | 'medium' | 'large';
  listName: string;
}

export function WatchlistWidget({ items, size, listName }: WatchlistWidgetProps) {
  const displayCount = size === 'small' ? 1 : size === 'medium' ? 3 : 5;
  const displayItems = items.slice(0, displayCount);
  const imageHeight = size === 'small' ? 120 : 100;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#000000',
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text={`My Watchlist: ${listName}`}
        style={{
          fontSize: 14,
          color: '#E50914',
          fontWeight: 'bold',
          marginBottom: 8,
        }}
      />

      <FlexWidget
        style={{
          flexDirection: size === 'small' ? 'column' : 'row',
          flexGap: 8,
          flex: 1,
        }}
      >
        {displayItems.length > 0 ? (
          displayItems.map((item) => (
            <FlexWidget
              key={item.id}
              style={{
                flex: 1,
                backgroundColor: '#1a1a1a',
                borderRadius: 8,
                padding: 4,
                flexDirection: 'column',
              }}
              clickAction="OPEN_APP"
            >
              <ImageWidget
                image={`https://image.tmdb.org/t/p/w185${item.posterPath}`}
                imageWidth={80}
                imageHeight={imageHeight}
                radius={4}
                style={{
                  borderRadius: 4,
                }}
              />
              {size !== 'small' && (
                <TextWidget
                  text={item.title}
                  style={{
                    fontSize: 10,
                    color: '#ffffff',
                    marginTop: 4,
                  }}
                  maxLines={1}
                  truncate="END"
                />
              )}
            </FlexWidget>
          ))
        ) : (
          <FlexWidget
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text="No items in this list"
              style={{
                fontSize: 12,
                color: '#888888',
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
