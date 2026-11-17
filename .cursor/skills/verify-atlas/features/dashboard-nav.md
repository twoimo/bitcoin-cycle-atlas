# 대시보드 메뉴

Dashboard routes share one scrolling pill row: 가격 차트, 시장 분석, 리서치, 자산 비교, 공모주, 릴레이 콘텐츠.

## Sub-features

- Previous and next buttons `이전 페이지 메뉴 보기` and `다음 페이지 메뉴 보기`
- Current page `[aria-current="page"]` inside `.atlas-nav`

## How to get to it (user POV)

Open `/?page=relay` at 390×844. The header title is `릴레이 콘텐츠`.

## Driving it with the browser

Read `.atlas-nav` and the current pill. The current pill's left and right must sit inside the nav box without a click. Then press `다음 페이지 메뉴 보기` or `이전 페이지 메뉴 보기` and confirm the row moves and does not jump back to the current pill while focus is on the pager.

## Gotchas

On 2026-11-18 the published `ed373cd8` page left `릴레이 콘텐츠` outside the 270px row until the reader paged. The repair reveals the current pill only when focus is outside the row. A focused pill is left where the reader put it.
