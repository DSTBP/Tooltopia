
% LIST OPERATIONS %
use_module(library(lists)).

write_last([X]) :- write(X).
write_last([_|L]) :-
    write_last(L).

% FILE PROCESSING %

read_file(Stream,[]) :-
    at_end_of_stream(Stream).
read_file(Stream,[X|L]) :-
    \+ at_end_of_stream(Stream),
    read_line_to_codes(Stream,Codes),
    atom_chars(X, Codes),
    read_file(Stream,L), !.

write_file([]) :- !.
write_file([X|L]) :-
    write(X), nl, write_file(L).

% ERROR MESSAGES %

error_msg :- write('\n\nInvalid input! Please try again...\n\n').
exit_msg :- write('\n\nGoodbye!\n\n').

% MENUS %

main_menu :-
    write(' _______  _______  _     _  _______  ___      _______\n'),
    write('|       ||   _   || | _ | ||   _   ||   |    |       |\n'),
    write('|   _   ||  |_|  || || || ||  |_|  ||   |    |    ___|\n'),
    write('|  | |  ||       ||       ||       ||   |    |   |___ \n'),
    write('|  |_|  ||       ||       ||       ||   |___ |    ___|\n'),
    write('|      | |   _   ||   _   ||   _   ||       ||   |___ \n'),
    write('|____||_||__| |__||__| |__||__| |__||_______||_______|\n'),
    write('\n'),
    write('1. - Play\n'),
    write('2. - Quit\n').


validate_mode(P1/P2) :-
    ground(P1), ground(P2),
    validate_player(P1), validate_player(P2).

validate_player(h).
validate_player(c-Level) :-
    1 is Level; 2 is Level.
    
play_menu(Mode) :-
    write('Stacks are represented as "bottom -> top"\n'),
    write('How would you like to play? Please input the role of each player in the format [P1/P2.].\nAvailable roles:\n[h] - Human player;\n[c-1] - Easy computer;\n[c-2] - Hard computer;\n\n'),
    read(NMode),
    (
        validate_mode(NMode) -> 
        (
            Mode = NMode,!
        );
        write('Not a valid gamemode! Try again...\n'),
        !, play_menu(Mode)
    ).

quit_menu :-
    write('\n\nThank you for playing. Goodbye!\n\n'),
    abort. 

display_game(Board) :-
    draw_board(Board).

finish((c-L)/Color) :-
    L = 1 ->
    (
        write('Roger, roger!\n'),
        !, abort
    );
    (
        write('I\'m sorry Dave, I\'m afraid I can\'t let you do that...\nI win.\n'),
        !, abort
    ).

finish(h/Color) :-
    Color = 'd' -> 
    (
        write('Dark Pieces you won!!!\n'),
        !, abort
    );
    (
        write('Light Pieces you won!!!\n'),
        !, abort
    ).

end_draw :-
    format('Draw!!!! Looks like you are evenly matched!~n').

% BOARD DRAWING %

% ┌────┬────┬────┬────┐
% │    │    │    │    │
% ┼────┼────┼────┼────┼
% │    │    │    │    │
% ┼────┼────┼────┼────┼
% │    │    │    │    │
% ┼────┼────┼────┼────┼
% │    │    │    │    │
% └────┴────┴────┴────┘
draw_board(Board) :-
    write('    A   B   C   D  \n  ┌───┬───┬───┬───┐\n'),
    draw_lines(Board),nl,
    draw_stacks(Board).

draw_lines([]) :-
    write('  └───┴───┴───┴───┘'),nl.

draw_lines([X]) :-
    length(L, Length),
    Length1 is (Length - 4)*(-1),
    write(Length1),
    write(' │ '),
    draw_cells(X),
    draw_lines(L).

draw_lines([X|L]) :-
    length(L, Length),
    Length1 is (Length - 4)*(-1),
    write(Length1),
    write(' │ '),
    draw_cells(X),
    write('  ┼───┼───┼───┼───┼\n'),
    draw_lines(L).

draw_cells([]) :- nl,!.
draw_cells([X|L]) :-
    draw_cell(X),
    write(' │ '),
    draw_cells(L).

draw_cell(X) :-
    sub_atom(X, _, 1, 0, NX),
    write(NX).

draw_stacks([]) :- !.
draw_stacks([X|L]) :-
    length(L, Length),
    Length1 is (Length - 4)*(-1),
    draw_stack_line(X, Length1), nl,
    draw_stacks(L).

draw_stack_line([], _) :- nl, !.
draw_stack_line([X|L], R) :-
    length(L, Length),
    C1 is 64+(Length - 4)*(-1),
    char_code(C, C1),
    draw_stack(X, R, C),
    tab(1),
    draw_stack_line(L, R).

draw_stack(X, R, C) :-
    write(C),write(R),write(' = ['), write(X), write(']').

% Movement %

get_by_index([X|_], 0, X) :- !.
get_by_index([X|L], Index, Line) :-
    NewIndex is Index-1,
    get_by_index(L, NewIndex, Line).

get_stack(Board, Col/Row, Stack) :-
    get_by_index(Board, Row, Line),
    get_by_index(Line, Col, Stack).

get_stack_top(Board, Placement, Top) :-
    get_stack(Board, Placement, Stack),
    sub_atom(Stack, _, 1, 0, Top).

row_col_to_value(Col/Row, X, Y) :-
    char_code(Col, ColCode),
    X is ColCode-97,
    Y is Row-1.

value_to_row_col(Col/Row, X, Y) :-
    ColCode is Col+65,
    char_code(ColSymb, ColCode),
    X = ColSymb,
    Y is Row+1.

valid_row_col(Col/Row) :- 
    member(Row, [1, 2, 3, 4]),
    member(Col, ['a', 'b', 'c', 'd']).

valid_piece_placement(Board, Pos) :-
    get_stack(Board, Pos, Stack),
    not(member(Stack, [' '])).

get_piece_placement(Board, Pos) :-
    write('Where would you like to place your piece (Col/Row)?\n'),
    read(Placement),
    (
        valid_row_col(Placement) ->
        (
            row_col_to_value(Placement, X, Y),
            Pos = X/Y,
            valid_piece_placement(Board, Pos) ->
            (
                !
            ); 
            write('Not a valid place! Try again...\n'),
            !, get_piece_placement(Board, Pos)
        );
        write('Not a valid place! Try again...\n'),
        !, get_piece_placement(Board, Pos)
    ).

check_backtrack(CX/CY, NX/NY) :-
    CY = NY, CX = NX.

check_valid_move(CY/CX, NY/NX) :-
    (NX is CX + 1 ; NX is CX - 1),
    CY = NY.

check_valid_move(CY/CX, NY/NX) :-
    CX = NX,
    (NY is CY + 1 ; NY is CY - 1).

get_move(Board, Stack, CurrPos, PrevPos, Move) :- 
    value_to_row_col(CurrPos, CurrY, CurrX),
    value_to_row_col(PrevPos, PrevY, PrevX),
    format('Where would you like to move (Row/Col?)~nCurrent stack: ~w~nCurrent position: ~w~w~nPrevious position: ~w~w~n', [Stack, CurrY, CurrX, PrevY, PrevX]),
    read(Placement),
    (
        valid_row_col(Placement) ->
        (
            row_col_to_value(Placement, X, Y),
            Pos = X/Y,
            not(check_backtrack(Pos, PrevPos)) -> 
            (
                row_col_to_value(Placement, X, Y),
                Pos = X/Y, 
                check_valid_move(CurrPos, Pos) ->
                (
                    Move = Pos, !
                );
                write('Invalid move! Try again...\n'),
                !, get_move(Board, Stack, CurrPos, PrevPos, Move)
            );
            write('Invalid move! Try again...\n'),
            !, get_move(Board, Stack, CurrPos, PrevPos, Move)
        );
        write('Invalid move! Try again...\n'),
        !, get_move(Board, Stack, CurrPos, PrevPos, Move)
    ).

