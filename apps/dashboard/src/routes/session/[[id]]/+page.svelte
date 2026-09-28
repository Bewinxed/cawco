<!-- One route for the whole strip: `/session` is the fleet board and
     `/session/<id>` is a conversation, and both are drawn by
     `SessionSurface`, which the Shell keeps mounted once a `/session` page
     has shown (parked under any other spoke) and which holds all of them at
     once, showing whichever the URL points at. The id is optional so that
     moving between the board and a conversation is a parameter change
     rather than a change of route — the router swaps no components for it,
     which is what makes Fleet cost the same as any other tab. This page
     exists to declare the route. -->
