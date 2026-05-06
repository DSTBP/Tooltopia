:-consult('io.pl').

% BOARD/MODE %

tan('t').
dark('d').
light('l').
board([['tt', ' ', ' ', 'tt'],
       [' ', ' ', ' ', ' '],
       [' ', ' ', ' ', ' '],
       ['tt', ' ', ' ', 'tt']]).

mode(h/h).
:- dynamic(mode/1).

replace([_|T], 0, X, [X|T]):- !.
replace([H|T], I, X, [H|R]):-
    I > 0,
    I1 is I-1,
    replace(T, I1, X, R).

stack_split(Stack, Index, First, Second) :-
    atom_codes(Stack, Codes),
    length(FirstCodes, Index),
    append(FirstCodes, SecondCodes, Codes),
    atom_codes(First, FirstCodes),
    atom_codes(Second, SecondCodes).

% MENU LOGIC %

play :-
    menu(main_menu).

menu(main_menu) :- 
    main_menu,
    read(Opt),
    (
        Opt =:= 1 ->
            menu(play),
            start_game;
        Opt =:= 2 -> 
            menu(quit),
        error_msg,!,
        menu(main_menu)
    ).

menu(quit) :- quit_menu.
menu(play) :- 
    play_menu(Mode),
    retractall(mode(_)),
    assert(mode(Mode)), !.

wait_for_input :-
    write('Write anything to continue (p.e: [c.])!\n'),
    read(X).

clear_screen :-
    write('\33\[2J').

% GAME LOGIC %

start_game :-
    initial_state(Board),
    mode(StartPlayer/SndPlayer),
    run_game(Board-16, StartPlayer/d, SndPlayer/l).

initial_state(Board) :-
    board(Board).

run_game(Board-0, Player, SndPlayer) :-    
    end_draw, abort,!.

run_game(Board-Turns, Player, SndPlayer) :-
    game_over(Board, SndPlayer) -> 
    (
        finish(SndPlayer)
    );
    game_over(Board, Player) ->
    (
        finish(Player)
    ).

run_game(Board-Turns, h/Color, SndPlayer) :-
    (
        clear_screen,
        write(Color), write(' is now playing:\n'),
        display_game(Board),
        get_piece_placement(Board, Pos), % Gets us the position of the stack to be played
        place_piece(Board, h/Color, Pos, PBoard), % Places the piece effectively on the right stack on the board
        display_game(PBoard),
        NewTurns is Turns - 1,
        CurrPos = Pos,
        PrevPos = Pos,
        get_stack(PBoard, CurrPos, Stack),
        remove_stack(PBoard, CurrPos, RBoard),
        move_stack(Player, RBoard, CurrPos, PrevPos, Stack, MBoard),
        run_game(MBoard-NewTurns, SndPlayer, h/Color)

    ).

run_game(Board-Turns, (c-Level)/Color, SndPlayer) :-
    clear_screen,
    write(Color), write(' is now playing:\n'),
    display_game(Board),
    cpu_placement(Board, (c-Level)/Color, Pos),
    place_piece(Board, (c-Level)/Color, Pos, PBoard),
    write('This is the board after placing a piece: \n'),
    display_game(PBoard),
    NewTurns is Turns - 1,
    CurrPos = Pos,
    PrevPos = Pos,
    get_stack(PBoard, CurrPos, Stack),
    remove_stack(PBoard, CurrPos, RBoard),
    write('Movement phase: \n'),
    cpu_movement(Level, Color, RBoard, CurrPos, PrevPos, Stack, MBoard),
    wait_for_input,
    run_game(MBoard-NewTurns, SndPlayer, (c-Level)/Color).

cpu_movement(Level, Color, Board, CurrPos, PrevPos, Stack, NBoard) :-
    (
        Level is 1 ->
        (
            atom_length(Stack, Length),
            Length > 0 -> 
            (
                find_moves(Board, CurrPos, PrevPos, Moves),
                random_member(Move, Moves),
                NPrevPos = CurrPos,
                move(Board, Stack, Move, NStack, MBoard),
                display_game(MBoard),
                cpu_movement(Level, Color, MBoard, Move, NPrevPos, NStack, NBoard)
            ); NBoard = Board, !
        
        );
        Level is 2 ->
        (
            atom_length(Stack, Length),
            Length > 0 -> 
            (
                find_moves(Board, CurrPos, PrevPos, Moves),
                nth0(0, Moves, Best),
                stack_split(Stack, 1, Bottom, NStack),
                (Bottom = Color ->
                (
                    Value is 0
                );
                (
                    Value is 100
                )),
                value_move(Board, Bottom, Color, Moves, Best-Value, Move),
                write('Move: '),
                writeln(Move),
                NPrevPos = CurrPos,
                move(Board, Stack, Move, NStack, MBoard),
                display_game(MBoard),
                cpu_movement(Level, Color, MBoard, Move, NPrevPos, NStack, NBoard)
            ); NBoard = Board, !
        )
    ).

value_move(Board, Bottom, Color, [], Best-Value, Best):- write('Best: '),writeln(Best).
value_move(Board, Bottom, Color, [CurrPos|L], Best-Value, Move) :-
    (
        Bottom = Color ->
        (
            row_value(Board, Bottom, CurrPos, RowValue),
            col_value(Board, Bottom, CurrPos, ColumnValue),
            NValue is RowValue + ColumnValue,
            write('NValue: '), writeln(NValue),
            write('Value: '), writeln(Value),
            (
                NValue > Value ->
                value_move(Board, Bottom, Color, L, CurrPos-NValue, Move)
                ;value_move(Board, Bottom, Color, L, Best-Value, Move)
            )
        );
        (
            row_value(Board, Bottom, CurrPos, RowValue),
            col_value(Board, Bottom, CurrPos, ColumnValue),
            NValue is RowValue + ColumnValue,
            write('NValue: '), writeln(NValue),
            write('Value: '), writeln(Value),
            (
                NValue < Value ->
                value_move(Board, Bottom, Color, L, CurrPos-NValue, Move)
                ;value_move(Board, Bottom, Color, L, Best-Value, Move)
            )
        )
           
    ).

row_value(Board, Color, (X/Y), NValue) :-
    nth0(X, Board, Row),
    line_count_color(Row, Color, 0, NValue).

col_value(Board, Color, (X/Y), NValue) :-
    write('hi'),
    transpose(Board, NBoard),
    nth0(Y, NBoard, Col),
    line_count_color(Col, Color, 0, NValue).

line_count_color([], Color, Value, Value).
line_count_color([Stack|L], Color, Inc, Value) :-
    atom_chars(Stack, StackChars),
    stack_count_color(StackChars, Color, 0, StackValue),
    NInc is StackValue + Inc,
    line_count_color(L, Color, NInc, Value).


cpu_placement(Board, (c-Level)/Color, Place) :-
    (
        Level is 1 ->
        (
            find_placements(Board, Places),
            random_member(Place, Places)
        );
        Level is 2 ->
        (
            find_placements(Board, Places),
            nth0(0, Places, Best),
            Value is 0,
            value_place(Board, Color, Places, Best-Value, Place)
        )
    ).

value_place(Board, Color, [], Best-Value, Best).
value_place(Board, Color, [CurrPos|L], Best-Value, NBest) :-
    get_stack(Board, CurrPos, Stack),
    atom_chars(Stack, StackChars),
    stack_count_color(StackChars, Color, 0, StackValue),
    (
        StackValue > Value ->
        value_place(Board, Color, L, CurrPos-StackValue, NBest)
        ;value_place(Board, Color, L, Best-Value, NBest)
    ).

stack_count_color([], _, Count, Count).
stack_count_color([X|L], Color, Inc, Count) :-
    (
        X = Color ->
        NInc is Inc + 1
        ;NInc is Inc
    ),
    stack_count_color(L, Color, NInc, Count).

within_board(Board, X/Y) :-
    between(0, 3, X), 
    between(0, 3, Y).

backtracking(PX/PY, X/Y) :-
    X = PX, Y = PY.

valid_placement(Board, X/Y) :-
    within_board(Board, X/Y),
    nth0(Y, Board, Row),
    nth0(X, Row, Placement),
    Placement \= ' '.

find_placements(Board, Places) :-
    findall(Move, valid_placement(Board, Move), Places).

valid_movement(Board, CX/CY, PX/PY, NX/NY) :-
    % inside the board %
    within_board(Board, NX/NY),
    % not backtracking %
    not(backtracking(PX/PY, NX/NY)),
    % orthogonally adjacent %
    (((plus(CX, -1, NX); succ(CX, NX)), CY = NY);
    ((plus(CY, -1, NY); succ(CY, NY)), CX = NX)).
    
find_moves(Board, CurrPos, PrevPos, Moves) :-
    findall(Move, valid_movement(Board, CurrPos, PrevPos, Move), Moves).

move_stack(Player, Board, CurrPos, PrevPos, Stack, NBoard) :-
    atom_length(Stack, Length),
    Length > 0 -> 
    (
        get_move(Board, Stack, CurrPos, PrevPos, Move),
        NPrevPos = CurrPos,
        move(Board, Stack, Move, NStack, RBoard),
        display_game(RBoard),
        move_stack(Player, RBoard, Move, NPrevPos, NStack, NBoard)

    ); 
    NBoard = Board, !.

remove_stack(Board, X/Y, NBoard) :- 
    get_by_index(Board, Y, Line),
    replace(Line, X, ' ', NLine),
    replace(Board, Y, NLine, NBoard).


game_over(Board, Player) :-
    % CHECK IF GAME OVER
    check_horizontals(Board, Player, 0);
    check_verticals(Board, Player, 0);
    check_diagonals(Board, Player).

check_horizontal(Row, Player/Color) :-
    get_by_index(Row, 0, Stack1), 
    get_by_index(Row, 1, Stack2),
    get_by_index(Row, 2, Stack3),
    get_by_index(Row, 3, Stack4),
    sub_atom(Stack1, _, 1, 0, Element1),
    sub_atom(Stack2, _, 1, 0, Element2),
    sub_atom(Stack3, _, 1, 0, Element3),
    sub_atom(Stack4, _, 1, 0, Element4),

    Element1 = Color ->
    (
        (Element1 = Element2, Element2 = Element3, Element3 = Element4)
    ).

check_horizontals(Board, Player/Color, RowNumber) :-
    RowNumber < 4 ->
    (
        get_by_index(Board, RowNumber, Row),
        check_horizontal(Row, Player/Color) -> 
        (
            true
        );
        NRowNumber is RowNumber + 1,
        check_horizontals(Board, Player/Color, NRowNumber)

    ).

check_verticals(Board, Player/Color, ColNumber) :-
    ColNumber < 4 ->
    (
        get_by_index(Board, 0, Line1),
        get_by_index(Board, 1, Line2),
        get_by_index(Board, 2, Line3),
        get_by_index(Board, 3, Line4),
    
        get_by_index(Line1, ColNumber, Stack1),
        get_by_index(Line2, ColNumber, Stack2),
        get_by_index(Line3, ColNumber, Stack3),
        get_by_index(Line4, ColNumber, Stack4),

        sub_atom(Stack1, _, 1, 0, Element1),
        sub_atom(Stack2, _, 1, 0, Element2),
        sub_atom(Stack3, _, 1, 0, Element3),
        sub_atom(Stack4, _, 1, 0, Element4),

        Element1 = Color ->
        (
            Element1 = Element2, Element2 = Element3, Element3 = Element4
        );
        NColNumber is ColNumber + 1,
        check_verticals(Board, Player/Color, NColNumber)

    ).

check_first_diagonal(Board, Player/Color) :-
        get_by_index(Board, 0, Line1),
        get_by_index(Board, 1, Line2),
        get_by_index(Board, 2, Line3),
        get_by_index(Board, 3, Line4),

        get_by_index(Line1, 0, Stack1),
        get_by_index(Line2, 1, Stack2),
        get_by_index(Line3, 2, Stack3),
        get_by_index(Line4, 3, Stack4),

        sub_atom(Stack1, _, 1, 0, Element1),
        sub_atom(Stack2, _, 1, 0, Element2),
        sub_atom(Stack3, _, 1, 0, Element3),
        sub_atom(Stack4, _, 1, 0, Element4),

        Element1 = Color ->
        (
            Element1 = Element2, Element2 = Element3, Element3 = Element4
        ).

check_second_diagonal(Board, Player/Color) :-
        get_by_index(Board, 0, Line1),
        get_by_index(Board, 1, Line2),
        get_by_index(Board, 2, Line3),
        get_by_index(Board, 3, Line4),

        get_by_index(Line1, 3, Stack1),
        get_by_index(Line2, 2, Stack2),
        get_by_index(Line3, 1, Stack3),
        get_by_index(Line4, 0, Stack4),

        sub_atom(Stack1, _, 1, 0, Element1),
        sub_atom(Stack2, _, 1, 0, Element2),
        sub_atom(Stack3, _, 1, 0, Element3),
        sub_atom(Stack4, _, 1, 0, Element4),

        Element1 = Color ->
        (
            Element1 = Element2, Element2 = Element3, Element3 = Element4
        ).

check_diagonals(Board, Player/Color) :-
    check_first_diagonal(Board, Player/Color);
    check_second_diagonal(Board, Player/Color).

place_piece(Board, Player/Color, X/Y, PBoard) :-
    get_by_index(Board, Y, Line),
    get_by_index(Line, X, Stack),
    atom_concat(Stack, Color, NStack),
    replace(Line, X, NStack, NLine),
    replace(Board, Y, NLine, PBoard).

move(Board, Stack, X/Y, NStack, NBoard) :-
    get_stack(Board, X/Y, Replacing), % In Board Location Stack
    (
        Replacing = ' ' ->
        NReplacing = '';
        NReplacing = Replacing
    ),
    stack_split(Stack, 1, Bottom, NStack), % Bottom is the thing to drop into Replacing and Top is the new stack (moving)
    atom_concat(NReplacing, Bottom, Replaced),
    get_by_index(Board, Y, Line),
    replace(Line, X, Replaced, NLine),
    replace(Board, Y, NLine, NBoard).
