Feature: Commenting on a chat
  Scenario: The comments control is present   # BEH-1
    Given I am in a chat
    Then a comments control is available in the chat toolbar

  Scenario: A comment added to a chat is remembered   # BEH-2, BEH-7
    Given I am in a chat
    When I add a comment to the chat
    Then the chat shows it has one comment
    And the comment is still there after a reload

  Scenario: Comments can be sent to the prompt box   # BEH-12
    Given I am in a chat
    When I add a comment to the chat
    And I send the comments to the prompt box
    Then the prompt box contains my comment
