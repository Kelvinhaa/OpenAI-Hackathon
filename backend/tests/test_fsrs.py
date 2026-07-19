import pytest

from backends.services.study import apply_fsrs


@pytest.mark.parametrize(
    ("rating", "expected_interval", "expected_stability", "expected_difficulty"),
    [
        (1, 1, 0.4197, 7.2102),
        (2, 1, 1.1829, 6.508547223894037),
        (3, 3, 3.1262, 5.314577829570867),
        (4, 15, 15.4722, 3.28285649513529),
    ],
)
def test_apply_fsrs_initializes_each_rating_independently(
    rating, expected_interval, expected_stability, expected_difficulty
):
    interval, stability, difficulty = apply_fsrs(
        stability=0,
        difficulty=0,
        review_count=0,
        rating=rating,
    )

    assert interval == expected_interval
    assert stability == pytest.approx(expected_stability)
    assert difficulty == pytest.approx(expected_difficulty)


def test_apply_fsrs_transitions_an_existing_good_review_by_rating():
    _, stability, difficulty = apply_fsrs(0, 0, 0, rating=3)

    again = apply_fsrs(stability, difficulty, review_count=1, rating=1, elapsed_days=3)
    good = apply_fsrs(stability, difficulty, review_count=1, rating=3, elapsed_days=3)
    easy = apply_fsrs(stability, difficulty, review_count=1, rating=4, elapsed_days=3)

    assert again[0] == 1
    assert again[1] < good[1]
    assert good == pytest.approx((3, 3.1121392150386145, 5.314577829570867))
    assert easy == pytest.approx((2, 2.0771909996696936, 5.318412219570867))


def test_apply_fsrs_clamps_out_of_range_ratings_to_supported_transitions():
    again = apply_fsrs(0, 0, 0, rating=1)
    easy = apply_fsrs(0, 0, 0, rating=4)

    assert apply_fsrs(0, 0, 0, rating=0) == again
    assert apply_fsrs(0, 0, 0, rating=5) == easy
